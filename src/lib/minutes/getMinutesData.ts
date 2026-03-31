import { getCouncilMeeting } from '@/lib/db/meetings';
import { getSubjectsForMeeting } from '@/lib/db/subject';
import { getExtractedDataForMeeting, SubjectExtractedData } from '@/lib/db/decisions';
import { getPeopleForCity } from '@/lib/db/people';
import { getCity } from '@/lib/db/cities';
import { getSpeakerDisplayInfo, isRoleActiveAt } from '@/lib/utils/roles';
import { PersonWithRelations } from '@/lib/db/people';
import { filterSubjectsForMinutes } from '@/lib/utils/subjects';
import prisma from '@/lib/db/prisma';
import {
    MinutesData,
    MinutesSubject,
    MinutesAttendance,
    MinutesVoteResult,
    MinutesMember,
    MinutesTranscriptEntry,
} from './types';
import { compareRanks } from '@/lib/sorting/people';

import { buildTranscriptEntriesFromUtterances, GAP_FILL_THRESHOLD_SECONDS, GapContentUtterance } from './transcriptEntries';

export async function getMinutesData(
    cityId: string,
    meetingId: string,
): Promise<MinutesData> {
    const [meeting, city, subjects, extractedData, people] = await Promise.all([
        getCouncilMeeting(cityId, meetingId),
        getCity(cityId),
        getSubjectsForMeeting(cityId, meetingId),
        getExtractedDataForMeeting(cityId, meetingId),
        getPeopleForCity(cityId),
    ]);

    if (!meeting) {
        throw new Error('Meeting not found');
    }
    if (!city) {
        throw new Error('City not found');
    }

    // Build lookup maps
    const peopleMap = new Map(people.map(p => [p.id, p]));
    const extractedDataMap = new Map<string, SubjectExtractedData>(
        extractedData.map(ed => [ed.subjectId, ed])
    );

    // Filter to agenda + outOfAgenda subjects (exclude beforeAgenda)
    const filteredSubjects = filterSubjectsForMinutes(subjects);

    // Get transcript entries grouped by subject
    const subjectIds = filteredSubjects.map(s => s.id);
    const utteranceSelect = {
        id: true,
        text: true,
        startTimestamp: true,
        endTimestamp: true,
        discussionSubjectId: true,
        speakerSegment: {
            select: {
                id: true,
                meetingId: true,
                cityId: true,
                speakerTag: {
                    select: {
                        label: true,
                        personId: true,
                    },
                },
            },
        },
    } as const;

    const utterancesWithSpeaker = await prisma.utterance.findMany({
        where: {
            discussionSubjectId: { in: subjectIds },
            discussionStatus: { in: ['SUBJECT_DISCUSSION', 'VOTE'] },
        },
        select: utteranceSelect,
        orderBy: { startTimestamp: 'asc' },
    });

    type UtteranceWithSpeaker = typeof utterancesWithSpeaker[number];

    // Group utterances by subject
    const utterancesBySubject = new Map<string, UtteranceWithSpeaker[]>();
    for (const u of utterancesWithSpeaker) {
        if (!u.discussionSubjectId) continue;
        const list = utterancesBySubject.get(u.discussionSubjectId) || [];
        list.push(u);
        utterancesBySubject.set(u.discussionSubjectId, list);
    }

    // Subject name map for gap marker labels (includes all subjects, not just filtered)
    const subjectNameMap = new Map(subjects.map(s => [s.id, s.name]));

    // Per-subject gap content info for long gaps
    const gapContentBySubject = new Map<string, GapContentUtterance[]>();

    // Detect gaps, fetch fill utterances for short gaps, check content for long gaps
    for (const [subjectId, utterances] of utterancesBySubject) {
        if (utterances.length < 2) continue;

        const shortGapRanges: { start: number; end: number }[] = [];

        for (let i = 0; i < utterances.length - 1; i++) {
            const current = utterances[i];
            const next = utterances[i + 1];
            const gap = next.startTimestamp - current.endTimestamp;

            if (gap > 0 && gap < GAP_FILL_THRESHOLD_SECONDS) {
                shortGapRanges.push({ start: current.endTimestamp, end: next.startTimestamp });
            }
        }

        if (shortGapRanges.length > 0) {
            // Fetch fill utterances for all short gaps in one batch
            const fillUtterances = await prisma.utterance.findMany({
                where: {
                    speakerSegment: {
                        meetingId: meeting.id,
                        cityId: cityId,
                    },
                    OR: shortGapRanges.map(range => ({
                        startTimestamp: { gte: range.start, lt: range.end },
                    })),
                    NOT: { discussionSubjectId: { in: subjectIds } },
                },
                select: utteranceSelect,
                orderBy: { startTimestamp: 'asc' },
            });

            // Merge fill utterances into the list at correct positions
            if (fillUtterances.length > 0) {
                const merged = [...utterances, ...fillUtterances];
                merged.sort((a, b) => a.startTimestamp - b.startTimestamp);
                utterancesBySubject.set(subjectId, merged);
            }
        }

        // After short gap handling, detect long gaps and check for content
        const updatedUtterances = utterancesBySubject.get(subjectId)!;
        const longGapRanges: { start: number; end: number }[] = [];
        for (let i = 0; i < updatedUtterances.length - 1; i++) {
            const gap = updatedUtterances[i + 1].startTimestamp - updatedUtterances[i].endTimestamp;
            if (gap >= GAP_FILL_THRESHOLD_SECONDS) {
                longGapRanges.push({
                    start: updatedUtterances[i].endTimestamp,
                    end: updatedUtterances[i + 1].startTimestamp,
                });
            }
        }

        if (longGapRanges.length > 0) {
            // Check what content exists in long gap ranges (for silence vs real gap detection)
            const gapContent = await prisma.utterance.findMany({
                where: {
                    speakerSegment: { meetingId: meeting.id, cityId },
                    OR: longGapRanges.map(r => ({
                        startTimestamp: { gte: r.start, lt: r.end },
                    })),
                    id: { notIn: updatedUtterances.map(u => u.id) },
                },
                select: { startTimestamp: true, discussionSubjectId: true },
                orderBy: { startTimestamp: 'asc' },
            });
            gapContentBySubject.set(subjectId, gapContent);
        }
    }

    const meetingDate = new Date(meeting.dateTime);

    function buildTranscriptEntries(subjectId: string): MinutesTranscriptEntry[] {
        const utterances = utterancesBySubject.get(subjectId) || [];
        return buildTranscriptEntriesFromUtterances(utterances, (personId, label) => {
            const person = personId ? peopleMap.get(personId) : null;
            const speakerName = person ? person.name_short : (label || 'Ομιλητής');
            const { party, role, isPartyHead } = person
                ? getSpeakerDisplayInfo(person.roles || [], meetingDate)
                : { party: null, role: null, isPartyHead: false };
            return {
                speakerName,
                party: party?.name_short ?? null,
                isPartyHead,
                role: role?.name ?? null,
            };
        }, {
            gapContentUtterances: gapContentBySubject.get(subjectId) ?? [],
            subjectNames: subjectNameMap,
        });
    }

    function getElectedOrder(personId: string): number | null {
        const person = peopleMap.get(personId);
        if (!person) return null;
        const role = person.roles.find(r => r.electedOrder != null);
        return role?.electedOrder ?? null;
    }

    const sortByElectedOrder = (a: MinutesMember, b: MinutesMember) => {
        const orderCompare = compareRanks(getElectedOrder(a.personId), getElectedOrder(b.personId));
        if (orderCompare !== 0) return orderCompare;
        return a.name.localeCompare(b.name);
    };

    function buildAttendance(ed: SubjectExtractedData): MinutesAttendance {
        const present: MinutesMember[] = [];
        const absent: MinutesMember[] = [];

        for (const a of ed.attendance) {
            const person = peopleMap.get(a.personId);
            const { party, role, isPartyHead } = person
                ? getSpeakerDisplayInfo(person.roles || [], meetingDate)
                : { party: null, role: null, isPartyHead: false };

            const member: MinutesMember = {
                personId: a.personId,
                name: a.personName,
                party: party?.name_short ?? null,
                isPartyHead,
                role: role?.name ?? null,
            };

            if (a.status === 'PRESENT') {
                present.push(member);
            } else {
                absent.push(member);
            }
        }

        present.sort(sortByElectedOrder);
        absent.sort(sortByElectedOrder);

        return { present, absent };
    }

    function buildVoteResult(ed: SubjectExtractedData): MinutesVoteResult | null {
        if (ed.votes.length === 0) return null;

        const forMembers: MinutesMember[] = [];
        const againstMembers: MinutesMember[] = [];
        const abstainMembers: MinutesMember[] = [];

        for (const v of ed.votes) {
            const person = peopleMap.get(v.personId);
            const { party, role, isPartyHead } = person
                ? getSpeakerDisplayInfo(person.roles || [], meetingDate)
                : { party: null, role: null, isPartyHead: false };

            const member: MinutesMember = {
                personId: v.personId,
                name: v.personName,
                party: party?.name_short ?? null,
                isPartyHead,
                role: role?.name ?? null,
            };

            switch (v.voteType) {
                case 'FOR': forMembers.push(member); break;
                case 'AGAINST': againstMembers.push(member); break;
                case 'ABSTAIN': abstainMembers.push(member); break;
            }
        }

        forMembers.sort(sortByElectedOrder);
        againstMembers.sort(sortByElectedOrder);
        abstainMembers.sort(sortByElectedOrder);

        const passed = forMembers.length > againstMembers.length;
        const isUnanimous = forMembers.length > 0 && againstMembers.length === 0 && abstainMembers.length === 0;

        return { forMembers, againstMembers, abstainMembers, passed, isUnanimous };
    }

    // Sort subjects by discussion order (first utterance timestamp)
    const firstUtteranceBySubject = new Map<string, number>();
    for (const [subjectId, utterances] of utterancesBySubject) {
        if (utterances.length > 0) {
            firstUtteranceBySubject.set(subjectId, utterances[0].startTimestamp);
        }
    }

    // For subjects discussed alongside another subject (discussedIn),
    // use the parent subject's timestamp so they sort adjacent to their parent.
    function getDiscussionTime(s: typeof filteredSubjects[number]): number | undefined {
        const own = firstUtteranceBySubject.get(s.id);
        if (own !== undefined) return own;
        if (s.discussedIn) return firstUtteranceBySubject.get(s.discussedIn.id);
        return undefined;
    }

    const sortedSubjects = [...filteredSubjects].sort((a, b) => {
        const aTime = getDiscussionTime(a);
        const bTime = getDiscussionTime(b);

        // Both have discussion times: sort by time
        if (aTime !== undefined && bTime !== undefined) {
            if (aTime !== bTime) return aTime - bTime;
            // Same timestamp (child inherits parent's time): parent comes first
            const aIsChild = a.discussedIn != null;
            const bIsChild = b.discussedIn != null;
            if (aIsChild !== bIsChild) return aIsChild ? 1 : -1;
            return (a.agendaItemIndex ?? 0) - (b.agendaItemIndex ?? 0);
        }
        // Subjects with discussion time come before those without
        if (aTime !== undefined) return -1;
        if (bTime !== undefined) return 1;

        // Fallback for subjects without transcript: agenda order
        const aIsOOA = a.nonAgendaReason === 'outOfAgenda';
        const bIsOOA = b.nonAgendaReason === 'outOfAgenda';
        if (aIsOOA && !bIsOOA) return 1;
        if (!aIsOOA && bIsOOA) return -1;
        return (a.agendaItemIndex ?? 0) - (b.agendaItemIndex ?? 0);
    });

    // Build MinutesSubject for each
    const minutesSubjects: MinutesSubject[] = sortedSubjects.map(s => {
        const ed = extractedDataMap.get(s.id);
        const attendance = ed && ed.attendance.length > 0 ? buildAttendance(ed) : null;
        const voteResult = ed ? buildVoteResult(ed) : null;

        return {
            subjectId: s.id,
            agendaItemIndex: s.agendaItemIndex,
            nonAgendaReason: s.nonAgendaReason as 'beforeAgenda' | 'outOfAgenda' | null,
            name: s.name,
            discussedWith: s.discussedIn ? {
                id: s.discussedIn.id,
                name: s.discussedIn.name,
                agendaItemIndex: s.discussedIn.agendaItemIndex,
            } : null,
            decision: s.decision ? {
                protocolNumber: s.decision.protocolNumber,
                excerpt: s.decision.excerpt ?? null,
                references: s.decision.references ?? null,
            } : null,
            attendance,
            voteResult,
            transcriptEntries: buildTranscriptEntries(s.id),
        };
    });

    // Overall attendance: first subject that has attendance data
    const overallAttendance = minutesSubjects.find(s => s.attendance)?.attendance ?? null;

    return {
        city: {
            name: city.name,
            name_municipality: city.name_municipality,
            timezone: city.timezone,
        },
        meeting: {
            id: meeting.id,
            cityId: meeting.cityId,
            name: meeting.name,
            dateTime: meeting.dateTime.toISOString(),
        },
        administrativeBody: meeting.administrativeBody?.name ?? null,
        overallAttendance,
        subjects: minutesSubjects,
    };
}
