import { getCouncilMeeting } from '@/lib/db/meetings';
import { getSubjectsForMeeting } from '@/lib/db/subject';
import { getExtractedDataForMeeting, getMeetingAttendance, SubjectExtractedData } from '@/lib/db/decisions';
import { getPeopleForCity } from '@/lib/db/people';
import { getCity } from '@/lib/db/cities';
import { getSpeakerDisplayInfo, isRoleActiveAt, isMayorRole, simplifyRoleName } from '@/lib/utils/roles';
import { PersonWithRelations } from '@/lib/db/people';
import prisma from '@/lib/db/prisma';
import {
    MinutesData,
    MinutesSubject,
    MinutesMember,
    MinutesTranscriptEntry,
} from './types';
import { formatSurnameFirst } from '@/lib/formatters/name';
import {
    buildAttendance,
    buildVoteResult,
    buildCouncilComposition,
    buildAttendanceChanges,
    sortSubjectsByDiscussionOrder,
    sortByElectedOrder,
    MemberResolver,
    ElectedOrderGetter,
} from './builders';

import { buildTranscriptEntriesFromUtterances, GAP_FILL_THRESHOLD_SECONDS, GapContentUtterance } from './transcriptEntries';

export async function getMinutesData(
    cityId: string,
    meetingId: string,
): Promise<MinutesData> {
    const [meeting, city, subjects, extractedData, people, meetingAttendance] = await Promise.all([
        getCouncilMeeting(cityId, meetingId),
        getCity(cityId),
        getSubjectsForMeeting(cityId, meetingId),
        getExtractedDataForMeeting(cityId, meetingId),
        getPeopleForCity(cityId),
        getMeetingAttendance(cityId, meetingId),
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
    // Includes withdrawn subjects — they appear in the TOC but get empty transcript entries
    const filteredSubjects = subjects.filter(
        s => s.agendaItemIndex || s.nonAgendaReason === 'outOfAgenda'
    );

    // Get transcript entries grouped by non-withdrawn subjects only
    const subjectIds = filteredSubjects.filter(s => !s.withdrawn).map(s => s.id);
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

    // Shared member resolver: looks up person in peopleMap, resolves display info
    const resolveMember: MemberResolver = (personId, fallbackName) => {
        const person = peopleMap.get(personId);
        const { party, role, isPartyHead } = person
            ? getSpeakerDisplayInfo(person.roles || [], meetingDate)
            : { party: null, role: null, isPartyHead: false };
        return {
            personId,
            name: formatSurnameFirst(fallbackName),
            party: party?.name_short ?? null,
            isPartyHead,
            role: simplifyRoleName(role?.name ?? null),
        };
    };

    const adminBodyId = meeting.administrativeBody?.id ?? null;

    const getElectedOrder: ElectedOrderGetter = (personId) => {
        const person = peopleMap.get(personId);
        if (!person) return null;
        if (!adminBodyId) return null;
        const role = person.roles.find(
            r => r.administrativeBodyId === adminBodyId && r.electedOrder != null
        );
        return role?.electedOrder ?? null;
    };

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

    // Sort subjects by discussion order (first utterance timestamp)
    const firstUtteranceBySubject = new Map<string, number>();
    for (const [subjectId, utterances] of utterancesBySubject) {
        if (utterances.length > 0) {
            firstUtteranceBySubject.set(subjectId, utterances[0].startTimestamp);
        }
    }

    const sortedSubjects = sortSubjectsByDiscussionOrder(filteredSubjects, firstUtteranceBySubject);

    // --- Orphaned utterances (no subject, or PROCEDURAL_VOTE which flows into preamble/gaps) ---
    const orphanedUtterances = await prisma.utterance.findMany({
        where: {
            speakerSegment: { meetingId: meeting.id, cityId },
            OR: [
                { discussionSubjectId: null },
                { discussionStatus: 'PROCEDURAL_VOTE' },
            ],
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

        // Assign orphan to the next subject that starts after it. This handles both:
        // - Orphans in the gap between subjects (the common case)
        // - Orphans interleaved within a subject's range (e.g. OTHER utterances
        //   between VOTE and SUBJECT_DISCUSSION of the next subject)
        let assigned = false;
        for (let i = 0; i < sortedSubjects.length; i++) {
            const bounds = subjectBounds[i];
            if (bounds.firstTs === Infinity) continue;

            if (u.startTimestamp < bounds.firstTs) {
                const list = preDiscussionByIndex.get(i) || [];
                list.push(u);
                preDiscussionByIndex.set(i, list);
                assigned = true;
                break;
            }
        }

        // Orphans after the last subject's start but before lastSubjectTs — append to epilogue
        if (!assigned) {
            epilogueUtterances.push(u);
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
        const attendance = ed && ed.attendance.length > 0
            ? buildAttendance(ed.attendance, mayorPersonId, resolveMember, getElectedOrder)
            : null;
        const voteResult = ed
            ? buildVoteResult(ed.votes, ed.attendance, mayorPersonId, resolveMember, getElectedOrder)
            : null;
        const preDiscussionUtterances = preDiscussionByIndex.get(index) || [];

        return {
            subjectId: s.id,
            agendaItemIndex: s.agendaItemIndex,
            nonAgendaReason: s.nonAgendaReason as 'beforeAgenda' | 'outOfAgenda' | null,
            withdrawn: s.withdrawn,
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
    // plus mayor and president of the administrative body.
    // Built from roles — no attendance dependency.
    const mayorPerson = mayorPersonId ? people.find(p => p.id === mayorPersonId) : null;
    const mayor = mayorPerson ? { personId: mayorPerson.id, name: mayorPerson.name } : null;

    let president: { personId: string; name: string } | null = null;
    if (adminBodyId) {
        for (const person of people) {
            const presidentRole = person.roles.find(r =>
                isRoleActiveAt(r, meetingDate) &&
                r.administrativeBodyId === adminBodyId && r.isHead
            );
            if (presidentRole) {
                president = { personId: person.id, name: person.name };
                break;
            }
        }
    }

    // Council/committee composition and absent members both come from the initial
    // roll call (MeetingAttendance). The composition IS present + absent — the full
    // body as recorded at the start of the meeting.
    //
    // For committees, members are split into regular (τακτικά) and substitute
    // (αναπληρωματικά) based on their Role.name in the administrative body.
    let councilCompositionResult = null;
    let absentMembers: MinutesMember[] | null = null;

    // Build a set of substitute member IDs (those with "Αναπληρωματικό Μέλος" role)
    const substitutePersonIds = new Set<string>();
    if (adminBodyId) {
        for (const person of people) {
            const substituteRole = person.roles.find(r =>
                isRoleActiveAt(r, meetingDate) &&
                r.administrativeBodyId === adminBodyId &&
                r.name === 'Αναπληρωματικό Μέλος'
            );
            if (substituteRole) substitutePersonIds.add(person.id);
        }
    }

    if (meetingAttendance.length > 0) {
        const allMembers = meetingAttendance
            .map(a => resolveMember(a.personId, a.person.name));

        const regularMembers = allMembers.filter(m => !substitutePersonIds.has(m.personId));
        const substituteMembers = allMembers.filter(m => substitutePersonIds.has(m.personId));

        councilCompositionResult = buildCouncilComposition(
            regularMembers, substituteMembers, mayor, president, mayorPersonId, getElectedOrder,
        );

        absentMembers = meetingAttendance
            .filter(a => a.status === 'ABSENT')
            .map(a => resolveMember(a.personId, a.person.name))
            .sort((a, b) => sortByElectedOrder(a, b, getElectedOrder));
    }


    // Compute mid-meeting attendance changes from per-subject attendance diffs
    const attendanceChanges = buildAttendanceChanges(
        minutesSubjects.filter(s => !s.withdrawn),
    );

    return {
        city: {
            name: city.name,
            name_municipality: city.name_municipality,
            timezone: city.timezone,
            logoImage: city.logoImage,
        },
        meeting: {
            id: meeting.id,
            cityId: meeting.cityId,
            name: meeting.name,
            dateTime: meeting.dateTime.toISOString(),
        },
        administrativeBody: meeting.administrativeBody
            ? { name: meeting.administrativeBody.name, type: meeting.administrativeBody.type }
            : null,
        councilComposition: councilCompositionResult,
        absentMembers,
        preambleEntries,
        attendanceChanges,
        subjects: minutesSubjects,
        epilogueEntries,
    };
}
