import { getCouncilMeeting } from '@/lib/db/meetings';
import { getSubjectsForMeeting } from '@/lib/db/subject';
import { getExtractedDataForMeeting, getMeetingAttendance, SubjectExtractedData } from '@/lib/db/decisions';
import { getPeopleForCity } from '@/lib/db/people';
import { getCity } from '@/lib/db/cities';
import { getElectedOrderForBody } from '@/lib/sorting/people';
import { getSpeakerDisplayInfo, isRoleActiveAt, isMayorRole, simplifyRoleName } from '@/lib/utils/roles';
import { agendaItemTitleOrName, isRecordSubject } from '@/lib/utils/subjects';
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
    discussedElsewhereIds,
    discussionOrderLabel,
    minutesSections,
    sortByElectedOrder,
    buildDiscussionSummary,
    buildProceduralVotes,
    MemberResolver,
    ElectedOrderGetter,
} from './builders';

import { buildTranscriptEntriesFromUtterances, CrossSubjectInfo } from './transcriptEntries';

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

    // The meeting's record subjects (agenda + outOfAgenda, excludes beforeAgenda) —
    // isRecordSubject is the one definition, shared with the decisions page.
    // Includes withdrawn subjects — they appear in the TOC but get empty transcript entries
    const sectionSubjects = subjects.filter(isRecordSubject);

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

    // Linked utterances per subject, any status — the discussion summary's input.
    const linkedBySubject = new Map<string, typeof allUtterances>();
    for (const u of allUtterances) {
        if (!u.discussionSubjectId) continue;
        const list = linkedBySubject.get(u.discussionSubjectId);
        if (list) list.push(u); else linkedBySubject.set(u.discussionSubjectId, [u]);
    }

    // Subject title map for cross-subject annotations (includes all subjects)
    const subjectNameMap = new Map(subjects.map(s => [s.id, agendaItemTitleOrName(s)]));

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

    // The subjects in discussion order, their temporal windows, and every utterance assigned to one bucket.
    const { ordered: sortedSubjects, assignment } = minutesSections(sectionSubjects, allUtterances);

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

    // Build a map from the active subjects' index → sortedSubjects index
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

        // Which subjects' sections hold utterances tagged to this subject
        const discussedElsewhere: NonNullable<MinutesSubject['discussedElsewhere']> = discussedElsewhereIds(s.id, assignment.crossSubjectMap)
            .flatMap(ownerSubjectId => {
                const ownerSubject = sectionSubjects.find(ss => ss.id === ownerSubjectId);
                return ownerSubject ? [{
                    subjectId: ownerSubjectId,
                    name: agendaItemTitleOrName(ownerSubject),
                    agendaItemIndex: ownerSubject.agendaItemIndex,
                }] : [];
            });

        return {
            subjectId: s.id,
            agendaItemIndex: s.agendaItemIndex,
            agendaSectionIndex: s.agendaSectionIndex,
            nonAgendaReason: s.nonAgendaReason,
            withdrawn: s.withdrawn,
            name: agendaItemTitleOrName(s),
            discussedWith: s.discussedIn ? {
                id: s.discussedIn.id,
                name: agendaItemTitleOrName(s.discussedIn),
                agendaItemIndex: s.discussedIn.agendaItemIndex,
                nonAgendaReason: s.discussedIn.nonAgendaReason,
            } : null,
            discussedElsewhere: discussedElsewhere.length > 0 ? discussedElsewhere : null,
            decision: s.decision ? {
                decisionNumber: s.decision.decisionNumber ?? null,
                protocolNumber: s.decision.protocolNumber,
                excerpt: s.decision.excerpt ?? null,
                references: s.decision.references ?? null,
            } : null,
            attendance,
            voteResult,
            discussion: buildDiscussionSummary(linkedBySubject.get(s.id) ?? []),
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

    // The order line, when subjects were discussed out of natural order.
    const discussionOrderLabelText = discussionOrderLabel(minutesSubjects.filter(s => !s.withdrawn));

    return {
        city: {
            name: city.name,
            name_municipality: city.name_municipality,
            timezone: city.timezone,
            logoImage: city.logoImage,
            realm: city.realm,
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
        discussionOrderLabel: discussionOrderLabelText,
        proceduralVotes: buildProceduralVotes(
            allUtterances,
            sectionSubjects.map(s => ({
                id: s.id,
                name: agendaItemTitleOrName(s),
                agendaItemIndex: s.agendaItemIndex,
                nonAgendaReason: s.nonAgendaReason === 'outOfAgenda' ? 'outOfAgenda' : null,
            })),
        ),
        subjects: minutesSubjects,
        epilogueEntries,
    };
}
