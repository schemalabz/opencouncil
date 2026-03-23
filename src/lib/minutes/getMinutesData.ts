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

    // Filter to agenda + beforeAgenda subjects (exclude outOfAgenda)
    const filteredSubjects = filterSubjectsForMinutes(subjects);

    // Get transcript entries grouped by subject
    const subjectIds = filteredSubjects.map(s => s.id);
    const utterancesWithSpeaker = await prisma.utterance.findMany({
        where: {
            discussionSubjectId: { in: subjectIds },
            discussionStatus: 'SUBJECT_DISCUSSION',
        },
        select: {
            id: true,
            text: true,
            startTimestamp: true,
            discussionSubjectId: true,
            speakerSegment: {
                select: {
                    speakerTag: {
                        select: {
                            label: true,
                            personId: true,
                        },
                    },
                },
            },
        },
        orderBy: { startTimestamp: 'asc' },
    });

    // Group utterances by subject, then consolidate consecutive same-speaker blocks
    const utterancesBySubject = new Map<string, typeof utterancesWithSpeaker>();
    for (const u of utterancesWithSpeaker) {
        if (!u.discussionSubjectId) continue;
        const list = utterancesBySubject.get(u.discussionSubjectId) || [];
        list.push(u);
        utterancesBySubject.set(u.discussionSubjectId, list);
    }

    const meetingDate = new Date(meeting.dateTime);

    function buildTranscriptEntries(subjectId: string): MinutesTranscriptEntry[] {
        const utterances = utterancesBySubject.get(subjectId) || [];
        if (utterances.length === 0) return [];

        const entries: MinutesTranscriptEntry[] = [];
        let currentPersonId: string | null | undefined = undefined;
        let currentLabel: string | null | undefined = undefined;
        let currentTexts: string[] = [];
        let currentTimestamp = 0;

        for (const u of utterances) {
            const tag = u.speakerSegment.speakerTag;
            const isSameSpeaker =
                currentPersonId !== undefined &&
                tag.personId === currentPersonId &&
                (tag.personId !== null || tag.label === currentLabel);

            if (isSameSpeaker) {
                currentTexts.push(u.text);
            } else {
                // Flush previous block
                if (currentTexts.length > 0 && currentPersonId !== undefined) {
                    entries.push(buildEntry(currentPersonId, currentLabel ?? null, currentTexts, currentTimestamp, meetingDate));
                }
                currentPersonId = tag.personId;
                currentLabel = tag.label;
                currentTexts = [u.text];
                currentTimestamp = u.startTimestamp;
            }
        }
        // Flush last block
        if (currentTexts.length > 0 && currentPersonId !== undefined) {
            entries.push(buildEntry(currentPersonId, currentLabel ?? null, currentTexts, currentTimestamp, meetingDate));
        }

        return entries;
    }

    function buildEntry(
        personId: string | null,
        label: string | null,
        texts: string[],
        timestamp: number,
        date: Date,
    ): MinutesTranscriptEntry {
        const person = personId ? peopleMap.get(personId) : null;
        const speakerName = person ? person.name_short : (label || 'Ομιλητής');
        const { party, role } = person
            ? getSpeakerDisplayInfo(person.roles || [], date)
            : { party: null, role: null };

        return {
            speakerName,
            party: party?.name_short ?? null,
            role: role?.name ?? null,
            text: texts.join(' '),
            timestamp,
        };
    }

    function buildAttendance(ed: SubjectExtractedData): MinutesAttendance {
        const present: MinutesMember[] = [];
        const absent: MinutesMember[] = [];

        for (const a of ed.attendance) {
            const person = peopleMap.get(a.personId);
            const { party, role } = person
                ? getSpeakerDisplayInfo(person.roles || [], meetingDate)
                : { party: null, role: null };

            const member: MinutesMember = {
                personId: a.personId,
                name: a.personName,
                party: party?.name_short ?? null,
                role: role?.name ?? null,
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

        const forMembers: MinutesMember[] = [];
        const againstMembers: MinutesMember[] = [];
        const abstainMembers: MinutesMember[] = [];

        for (const v of ed.votes) {
            const person = peopleMap.get(v.personId);
            const { party, role } = person
                ? getSpeakerDisplayInfo(person.roles || [], meetingDate)
                : { party: null, role: null };

            const member: MinutesMember = {
                personId: v.personId,
                name: v.personName,
                party: party?.name_short ?? null,
                role: role?.name ?? null,
            };

            switch (v.voteType) {
                case 'FOR': forMembers.push(member); break;
                case 'AGAINST': againstMembers.push(member); break;
                case 'ABSTAIN': abstainMembers.push(member); break;
            }
        }

        const passed = forMembers.length > againstMembers.length;
        const isUnanimous = forMembers.length > 0 && againstMembers.length === 0 && abstainMembers.length === 0;

        return { forMembers, againstMembers, abstainMembers, passed, isUnanimous };
    }

    // Sort subjects: beforeAgenda first, then by agendaItemIndex
    const sortedSubjects = [...filteredSubjects].sort((a, b) => {
        const aIsBeforeAgenda = a.nonAgendaReason === 'beforeAgenda';
        const bIsBeforeAgenda = b.nonAgendaReason === 'beforeAgenda';
        if (aIsBeforeAgenda && !bIsBeforeAgenda) return -1;
        if (!aIsBeforeAgenda && bIsBeforeAgenda) return 1;
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
