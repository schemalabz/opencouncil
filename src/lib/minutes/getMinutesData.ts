import { getCouncilMeeting } from '@/lib/db/meetings';
import { getSubjectsForMeeting } from '@/lib/db/subject';
import { getExtractedDataForMeeting, getMeetingAttendance, SubjectExtractedData } from '@/lib/db/decisions';
import { getPeopleForCity } from '@/lib/db/people';
import { getCity } from '@/lib/db/cities';
import { getElectedOrderForBody } from '@/lib/sorting/people';
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

import { buildTranscriptEntriesFromUtterances, CrossSubjectInfo } from './transcriptEntries';
import { computeTemporalWindows, assignUtterances } from './temporalWindows';

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
    const sectionSubjects = subjects.filter(
        s => s.agendaItemIndex || s.nonAgendaReason === 'outOfAgenda'
    );

    // Get active (non-withdrawn) subject IDs for temporal window computation
    const activeSubjectIds = sectionSubjects.filter(s => !s.withdrawn).map(s => s.id);

    // Fetch ALL meeting utterances in a single query (no status filter)
    const allUtterances = await prisma.utterance.findMany({
        where: {
            speakerSegment: { meetingId: meeting.id, cityId },
        },
        select: {
            id: true,
            text: true,
            startTimestamp: true,
            endTimestamp: true,
            discussionSubjectId: true,
            discussionStatus: true,
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

    // Subject name map for cross-subject annotations (includes all subjects)
    const subjectNameMap = new Map(subjects.map(s => [s.id, s.name]));

    // Compute temporal windows from linked utterances
    const windows = computeTemporalWindows(allUtterances, activeSubjectIds);

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
        return getElectedOrderForBody(person, adminBodyId);
    };

    // Compute preliminary first-utterance timestamps for discussion order sorting.
    // First pass: exclude PROCEDURAL_VOTE; second pass: fallback for procedural-only subjects.
    const preliminaryFirstUtterance = new Map<string, number>();
    for (const u of allUtterances) {
        if (u.discussionSubjectId && !preliminaryFirstUtterance.has(u.discussionSubjectId)) {
            if (u.discussionStatus !== 'PROCEDURAL_VOTE') {
                preliminaryFirstUtterance.set(u.discussionSubjectId, u.startTimestamp);
            }
        }
    }
    for (const u of allUtterances) {
        if (u.discussionSubjectId && !preliminaryFirstUtterance.has(u.discussionSubjectId)) {
            preliminaryFirstUtterance.set(u.discussionSubjectId, u.startTimestamp);
        }
    }

    const sortedSubjects = sortSubjectsByDiscussionOrder(sectionSubjects, preliminaryFirstUtterance);
    const sortedActiveIds = sortedSubjects.filter(s => !s.withdrawn).map(s => s.id);

    // Assign all utterances to temporal windows
    const assignment = assignUtterances(allUtterances, windows, sortedActiveIds);

    function buildTranscriptEntries(subjectId: string): MinutesTranscriptEntry[] {
        const utterances = assignment.utterancesBySubject.get(subjectId) || [];
        const crossMap = assignment.crossSubjectMap.get(subjectId);
        const crossSubjectInfo: CrossSubjectInfo | undefined = crossMap && crossMap.size > 0
            ? { crossSubjectUtterances: crossMap, subjectNames: subjectNameMap }
            : undefined;

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
        }, crossSubjectInfo);
    }

    function buildOrphanTranscriptEntries(utterances: typeof allUtterances): MinutesTranscriptEntry[] {
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
        });
    }

    const preambleEntries = buildOrphanTranscriptEntries(assignment.preambleUtterances);
    const epilogueEntries = buildOrphanTranscriptEntries(assignment.epilogueUtterances);

    // Build a map from sortedActiveIds index → sortedSubjects index
    // so we can look up pre-discussion utterances correctly (preDiscussionByIndex
    // is keyed by active subject index, not by sortedSubjects index)
    const activeIndexToSubjectId = new Map<number, string>();
    let activeIdx = 0;
    for (const s of sortedSubjects) {
        if (!s.withdrawn) {
            activeIndexToSubjectId.set(activeIdx, s.id);
            activeIdx++;
        }
    }
    // Invert: subjectId → active index for lookup
    const subjectIdToActiveIndex = new Map<string, number>();
    for (const [idx, id] of activeIndexToSubjectId) {
        subjectIdToActiveIndex.set(id, idx);
    }

    // Build MinutesSubject for each
    const minutesSubjects: MinutesSubject[] = sortedSubjects.map((s) => {
        const ed = extractedDataMap.get(s.id);
        const attendance = ed && ed.attendance.length > 0
            ? buildAttendance(ed.attendance, mayorPersonId, resolveMember, getElectedOrder)
            : null;
        const voteResult = ed
            ? buildVoteResult(ed.votes, ed.attendance, mayorPersonId, resolveMember, getElectedOrder)
            : null;
        const activeIndex = subjectIdToActiveIndex.get(s.id);
        const preDiscussionUtterances = activeIndex !== undefined
            ? (assignment.preDiscussionByIndex.get(activeIndex) || [])
            : [];

        // Compute discussedElsewhere: which subjects had cross-subject utterances
        // claimed by another subject's window
        let discussedElsewhere: MinutesSubject['discussedElsewhere'] = null;
        for (const [ownerSubjectId, crossMap] of assignment.crossSubjectMap) {
            for (const [, linkedSubjectId] of crossMap) {
                if (linkedSubjectId === s.id && ownerSubjectId !== s.id) {
                    if (!discussedElsewhere) discussedElsewhere = [];
                    const ownerSubject = sectionSubjects.find(ss => ss.id === ownerSubjectId);
                    if (ownerSubject && !discussedElsewhere.some(d => d.subjectId === ownerSubjectId)) {
                        discussedElsewhere.push({
                            subjectId: ownerSubjectId,
                            name: ownerSubject.name,
                            agendaItemIndex: ownerSubject.agendaItemIndex,
                        });
                    }
                }
            }
        }

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
            discussedElsewhere,
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

    // Verify no utterances were lost — count at the output level (after both
    // assignment and consumption) to catch index mismatches or dropped buckets.
    // Counts utterances backing speaker entries, not the entries themselves
    // (speaker entries merge consecutive same-speaker utterances).
    const renderedUtteranceCount =
        assignment.preambleUtterances.length +
        assignment.epilogueUtterances.length +
        minutesSubjects.reduce((sum, s) => {
            const preDiscIdx = subjectIdToActiveIndex.get(s.subjectId);
            const preDiscCount = preDiscIdx !== undefined
                ? (assignment.preDiscussionByIndex.get(preDiscIdx)?.length ?? 0)
                : 0;
            const transcriptCount = assignment.utterancesBySubject.get(s.subjectId)?.length ?? 0;
            return sum + preDiscCount + transcriptCount;
        }, 0);
    if (renderedUtteranceCount !== allUtterances.length) {
        console.error(
            `[getMinutesData] Utterance count mismatch: ${renderedUtteranceCount} rendered vs ${allUtterances.length} total. ` +
            `Some utterances may be missing from the minutes.`
        );
    }

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

    // Council/committee composition and absent members.
    // When MeetingAttendance records exist (from decision extraction), use those
    // for both composition and present/absent status.
    // When they don't exist, build composition from roles — we know who the members
    // are, just not who was present/absent.
    let councilCompositionResult = null;
    let absentMembers: MinutesMember[] | null = null;

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
    } else if (adminBodyId) {
        // Fallback: build composition from roles (no present/absent info)
        const roleMembers = people.filter(p =>
            p.roles.some(r => isRoleActiveAt(r, meetingDate) && r.administrativeBodyId === adminBodyId)
        );
        const allMembers = roleMembers.map(p => resolveMember(p.id, p.name));
        const regularMembers = allMembers.filter(m => !substitutePersonIds.has(m.personId));
        const substituteMembers = allMembers.filter(m => substitutePersonIds.has(m.personId));

        councilCompositionResult = buildCouncilComposition(
            regularMembers, substituteMembers, mayor, president, mayorPersonId, getElectedOrder,
        );
    }


    // Compute mid-meeting attendance changes from per-subject attendance diffs
    const attendanceChanges = buildAttendanceChanges(
        minutesSubjects.filter(s => !s.withdrawn),
        absentMembers,
    );

    // Build discussion order label if subjects were discussed out of natural order.
    // Natural order: OA subjects first (sorted), then regular subjects (sorted by agendaItemIndex).
    const nonWithdrawn = minutesSubjects.filter(s => !s.withdrawn);
    const naturalOrder = [
        ...nonWithdrawn.filter(s => s.nonAgendaReason === 'outOfAgenda'),
        ...nonWithdrawn.filter(s => s.nonAgendaReason !== 'outOfAgenda'),
    ].sort((a, b) => {
        const aIsOA = a.nonAgendaReason === 'outOfAgenda';
        const bIsOA = b.nonAgendaReason === 'outOfAgenda';
        if (aIsOA !== bIsOA) return aIsOA ? -1 : 1;
        return (a.agendaItemIndex ?? 0) - (b.agendaItemIndex ?? 0);
    });
    const isNaturalOrder = nonWithdrawn.every((s, i) => s.subjectId === naturalOrder[i]?.subjectId);

    let discussionOrderLabel: string | null = null;
    if (!isNaturalOrder && nonWithdrawn.length > 0) {
        let oaCounter = 0;
        discussionOrderLabel = nonWithdrawn.map(s => {
            if (s.nonAgendaReason === 'outOfAgenda') {
                oaCounter++;
                return `ΕΗΔ${oaCounter}`;
            }
            return `${s.agendaItemIndex}ο`;
        }).join(', ');
    }

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
        discussionOrderLabel,
        subjects: minutesSubjects,
        epilogueEntries,
    };
}
