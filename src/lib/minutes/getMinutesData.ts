import { getCouncilMeeting } from '@/lib/db/meetings';
import { getSubjectsForMeeting } from '@/lib/db/subject';
import { getExtractedDataForMeeting, SubjectExtractedData } from '@/lib/db/decisions';
import { getPeopleForCity } from '@/lib/db/people';
import { getCity } from '@/lib/db/cities';
import { getSpeakerDisplayInfo, isRoleActiveAt, isMayorRole, simplifyRoleName } from '@/lib/utils/roles';
import { PersonWithRelations } from '@/lib/db/people';
import { filterSubjectsForMinutes } from '@/lib/utils/subjects';
import prisma from '@/lib/db/prisma';
import {
    MinutesData,
    MinutesSubject,
    MinutesAttendance,
    MinutesCouncilComposition,
    MinutesVoteResult,
    MinutesMember,
    MinutesTranscriptEntry,
} from './types';
import { compareRanks } from '@/lib/sorting/people';
import { formatSurnameFirst } from '@/lib/formatters/name';

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

    // Identify mayor once — used to exclude them from per-subject attendance/votes
    // (the mayor is shown separately on the ΔΗΜΑΡΧΟΣ line in council composition)
    const mayorPersonId = people.find(p =>
        p.roles.some(r => isRoleActiveAt(r, meetingDate) && isMayorRole(r))
    )?.id ?? null;

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
                role: simplifyRoleName(role?.name ?? null),
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

        // Exclude mayor (shown separately) and sort by elected order
        const sortedAttendance = ed.attendance
            .filter(a => a.personId !== mayorPersonId)
            .sort((a, b) =>
                compareRanks(getElectedOrder(a.personId), getElectedOrder(b.personId))
                || a.personName.localeCompare(b.personName)
            );

        for (const a of sortedAttendance) {
            const person = peopleMap.get(a.personId);
            const { party, role, isPartyHead } = person
                ? getSpeakerDisplayInfo(person.roles || [], meetingDate)
                : { party: null, role: null, isPartyHead: false };

            const member: MinutesMember = {
                personId: a.personId,
                name: formatSurnameFirst(a.personName),
                party: party?.name_short ?? null,
                isPartyHead,
                role: simplifyRoleName(role?.name ?? null),
            };

            if (a.status === 'PRESENT') {
                present.push(member);
            } else {
                absent.push(member);
            }
        }

        return { present, absent };
    }

    function buildVoteResult(ed: SubjectExtractedData): MinutesVoteResult | null {
        if (ed.votes.length === 0) return null;

        // Sort all votes by elected order upfront — category arrays preserve this order
        const sortedVotes = [...ed.votes].sort((a, b) =>
            compareRanks(getElectedOrder(a.personId), getElectedOrder(b.personId))
            || a.personName.localeCompare(b.personName)
        );

        const forMembers: MinutesMember[] = [];
        const againstMembers: MinutesMember[] = [];
        const abstainMembers: MinutesMember[] = [];

        const voterIds = new Set<string>();
        for (const v of sortedVotes) {
            voterIds.add(v.personId);
            const person = peopleMap.get(v.personId);
            const { party, role, isPartyHead } = person
                ? getSpeakerDisplayInfo(person.roles || [], meetingDate)
                : { party: null, role: null, isPartyHead: false };

            const member: MinutesMember = {
                personId: v.personId,
                name: formatSurnameFirst(v.personName),
                party: party?.name_short ?? null,
                isPartyHead,
                role: simplifyRoleName(role?.name ?? null),
            };

            switch (v.voteType) {
                case 'FOR': forMembers.push(member); break;
                case 'AGAINST': againstMembers.push(member); break;
                case 'ABSTAIN': abstainMembers.push(member); break;
            }
        }

        // Absent members: those in attendance who are absent and didn't vote (excluding mayor)
        const absentMembers = ed.attendance
            .filter(a => a.status !== 'PRESENT' && !voterIds.has(a.personId) && a.personId !== mayorPersonId)
            .sort((a, b) =>
                compareRanks(getElectedOrder(a.personId), getElectedOrder(b.personId))
                || a.personName.localeCompare(b.personName)
            )
            .map(a => {
                const person = peopleMap.get(a.personId);
                const { party, role, isPartyHead } = person
                    ? getSpeakerDisplayInfo(person.roles || [], meetingDate)
                    : { party: null, role: null, isPartyHead: false };
                return {
                    personId: a.personId,
                    name: formatSurnameFirst(a.personName),
                    party: party?.name_short ?? null,
                    isPartyHead,
                    role: simplifyRoleName(role?.name ?? null),
                } as MinutesMember;
            });

        const passed = forMembers.length > againstMembers.length;
        const isUnanimous = forMembers.length > 0 && againstMembers.length === 0 && abstainMembers.length === 0;

        return { forMembers, againstMembers, abstainMembers, absentMembers, passed, isUnanimous };
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

    // --- Orphaned utterances (discussionSubjectId = null) ---
    const orphanedUtterances = await prisma.utterance.findMany({
        where: {
            speakerSegment: { meetingId: meeting.id, cityId },
            discussionSubjectId: null,
        },
        select: utteranceSelect,
        orderBy: { startTimestamp: 'asc' },
    });

    // Compute timestamp boundaries for each sorted subject
    const subjectBounds: { firstTs: number; lastTs: number }[] = sortedSubjects.map(s => {
        const utterances = utterancesBySubject.get(s.id) || [];
        if (utterances.length === 0) return { firstTs: Infinity, lastTs: -Infinity };
        return {
            firstTs: utterances[0].startTimestamp,
            lastTs: utterances[utterances.length - 1].endTimestamp,
        };
    });

    // Split orphaned utterances by position relative to subjects
    const preambleUtterances: UtteranceWithSpeaker[] = [];
    const epilogueUtterances: UtteranceWithSpeaker[] = [];
    const preDiscussionByIndex = new Map<number, UtteranceWithSpeaker[]>();

    const boundsWithUtterances = subjectBounds.filter(b => b.firstTs !== Infinity);
    const firstSubjectTs = boundsWithUtterances.length > 0
        ? Math.min(...boundsWithUtterances.map(b => b.firstTs))
        : Infinity;
    const lastSubjectTs = boundsWithUtterances.length > 0
        ? Math.max(...boundsWithUtterances.map(b => b.lastTs))
        : -Infinity;

    for (const u of orphanedUtterances) {
        if (u.startTimestamp < firstSubjectTs) {
            preambleUtterances.push(u);
            continue;
        }

        if (u.startTimestamp >= lastSubjectTs) {
            epilogueUtterances.push(u);
            continue;
        }

        // Find which subject this orphan falls before: it belongs to the first subject
        // whose first utterance starts after this orphan
        let assigned = false;
        for (let i = 0; i < sortedSubjects.length; i++) {
            const bounds = subjectBounds[i];
            if (bounds.firstTs === Infinity) continue;

            // Check if orphan falls between previous subject's end and this subject's start
            const prevEnd = i > 0
                ? Math.max(...subjectBounds.slice(0, i).filter(b => b.lastTs !== -Infinity).map(b => b.lastTs))
                : firstSubjectTs;

            if (u.startTimestamp >= prevEnd && u.startTimestamp < bounds.firstTs) {
                const list = preDiscussionByIndex.get(i) || [];
                list.push(u);
                preDiscussionByIndex.set(i, list);
                assigned = true;
                break;
            }
        }

        // Orphans within a subject's range that weren't assigned — append to preamble
        if (!assigned) {
            preambleUtterances.push(u);
        }
    }

    function buildOrphanTranscriptEntries(utterances: UtteranceWithSpeaker[]): MinutesTranscriptEntry[] {
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
                role: simplifyRoleName(role?.name ?? null),
            };
        }, { gapContentUtterances: [] });
    }

    const preambleEntries = buildOrphanTranscriptEntries(preambleUtterances);
    const epilogueEntries = buildOrphanTranscriptEntries(epilogueUtterances);

    // Build MinutesSubject for each
    const minutesSubjects: MinutesSubject[] = sortedSubjects.map((s, index) => {
        const ed = extractedDataMap.get(s.id);
        const attendance = ed && ed.attendance.length > 0 ? buildAttendance(ed) : null;
        const voteResult = ed ? buildVoteResult(ed) : null;
        const preDiscussionUtterances = preDiscussionByIndex.get(index) || [];

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
            preDiscussionEntries: buildOrphanTranscriptEntries(preDiscussionUtterances),
            transcriptEntries: buildTranscriptEntries(s.id),
        };
    });

    // Council composition: all members sorted by elected order,
    // plus mayor and president of the administrative body
    const firstSubjectWithAttendance = sortedSubjects.find(s => extractedDataMap.get(s.id)?.attendance?.length);
    const overallExtractedData = firstSubjectWithAttendance ? extractedDataMap.get(firstSubjectWithAttendance.id)! : null;
    const overallAttendance = overallExtractedData ? buildAttendance(overallExtractedData) : null;
    const adminBodyId = meeting.administrativeBody?.id ?? null;

    function buildCouncilComposition(attendance: MinutesAttendance, rawAttendance: SubjectExtractedData): MinutesCouncilComposition {
        // Use raw extracted data for presence checks — buildAttendance filters out the mayor
        const rawPresentIds = new Set(
            rawAttendance.attendance.filter(a => a.status === 'PRESENT').map(a => a.personId)
        );

        // Find mayor from all city people (not just attendance — mayor may not be a council member)
        let mayor: MinutesCouncilComposition['mayor'] = null;
        if (mayorPersonId) {
            const mayorPerson = people.find(p => p.id === mayorPersonId);
            if (mayorPerson) {
                mayor = { name: formatSurnameFirst(mayorPerson.name), present: rawPresentIds.has(mayorPersonId) };
            }
        }

        // Find president from all city people (head of the meeting's administrative body)
        let president: MinutesCouncilComposition['president'] = null;
        if (adminBodyId) {
            for (const person of people) {
                const presidentRole = person.roles.find(r =>
                    isRoleActiveAt(r, meetingDate) &&
                    r.administrativeBodyId === adminBodyId && r.isHead
                );
                if (presidentRole) {
                    president = { name: formatSurnameFirst(person.name), present: rawPresentIds.has(person.id) };
                    break;
                }
            }
        }

        // Exclude mayor from members list — they're shown separately on the ΔΗΜΑΡΧΟΣ line
        const allMembers = [...attendance.present, ...attendance.absent]
            .filter(m => m.personId !== mayorPersonId);
        allMembers.sort(sortByElectedOrder);

        return { mayor, president, members: allMembers };
    }

    const councilComposition = overallAttendance && overallExtractedData
        ? buildCouncilComposition(overallAttendance, overallExtractedData)
        : null;

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
        councilComposition,
        preambleEntries,
        subjects: minutesSubjects,
        epilogueEntries,
    };
}
