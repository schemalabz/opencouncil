// Callers authorize (the minutes and decisions routes gate on editing rights); the
// data function itself must also run from scripts, outside a request.
import { getCouncilMeetingDirect } from '@/lib/db/meetings';
import { getSubjectsForMeeting } from '@/lib/db/subject';
import { getExtractedDataForMeeting, getMeetingAttendance, SubjectExtractedData } from '@/lib/db/decisions';
import { getAttendanceEventsForMeeting } from '@/lib/db/derivationFacts';
import { readingStatesFacts } from '@/lib/derivation/load';
import { getPeopleForCity } from '@/lib/db/people';
import { getCity } from '@/lib/db/cities';
import { getElectedOrderForBody } from '@/lib/sorting/people';
import { getSpeakerDisplayInfo, isRoleActiveAt, isMayorRole, mayorIsMemberOf, simplifyRoleName } from '@/lib/utils/roles';
import { agendaItemTitleOrName, isRecordSubject } from '@/lib/utils/subjects';
import { PersonWithRelations } from '@/lib/db/people';
import prisma from '@/lib/db/prisma';
import {
    MinutesData,
    MinutesSubject,
    MinutesMember,
    MinutesAttendanceChange,
    MinutesTranscriptEntry,
} from './types';
import { extractFirstName, formatSurnameFirst, isFemaleName } from '@/lib/formatters/name';
import {
    buildAttendance,
    buildVoteResult,
    buildCouncilComposition,
    buildAttendanceChanges,
    buildAttendanceChangesFromEvents,
    buildMayorNote,
    presidentStandIn,
    discussedElsewhereIds,
    discussionOrderLabel,
    minutesSections,
    sortByElectedOrder,
    buildDiscussionSummary,
    buildProceduralVotes,
    MemberResolver,
    ElectedOrderGetter,
    MayorChange,
} from './builders';

import { buildTranscriptEntriesFromUtterances, CrossSubjectInfo } from './transcriptEntries';

/** Who a document says presided, read off the raw extraction it was stored with. */
function presidedByOf(extraction: unknown): { name: string; personId: string | null } | null {
    if (!extraction || typeof extraction !== 'object') return null;
    const presidedBy = (extraction as { presidedBy?: unknown }).presidedBy;
    if (!presidedBy || typeof presidedBy !== 'object') return null;
    const { name, personId } = presidedBy as { name?: unknown; personId?: unknown };
    if (typeof name !== 'string' || name.length === 0) return null;
    return { name, personId: typeof personId === 'string' && personId.length > 0 ? personId : null };
}

export async function getMinutesData(
    cityId: string,
    meetingId: string,
): Promise<MinutesData> {
    const [meeting, city, subjects, extractedData, people, meetingAttendance] = await Promise.all([
        getCouncilMeetingDirect(cityId, meetingId),
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

    // Identify mayor once. A mayor who is not a member of the body is left out of
    // the rows, the composition and the changes list: the ΔΗΜΑΡΧΟΣ line names them.
    const mayorPersonRow = people.find(p =>
        p.roles.some(r => isRoleActiveAt(r, meetingDate) && isMayorRole(r))
    ) ?? null;
    const mayorPersonId = mayorPersonRow?.id ?? null;
    // On a body the mayor sits on (the Δημοτική Επιτροπή) they vote like a member and stay in the rows.
    const mayorExcludedFromRows = mayorPersonRow && !mayorIsMemberOf(mayorPersonRow, meeting.administrativeBody ? { id: meeting.administrativeBody.id, type: meeting.administrativeBody.type } : null, meetingDate) ? mayorPersonId : null;

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
        }, crossSubjectInfo, assignment.resumedAt);
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

    // Who presided, as each subject's own document names it: the roster name when
    // the name resolved to a person, else the name as the document printed it.
    const documentedPresidedBy = new Map(sortedSubjects.map((s): [string, MinutesSubject['presidedBy']] => {
        const documented = s.decision && readingStatesFacts(s.decision) ? presidedByOf(s.decision.extraction) : null;
        const person = documented?.personId ? peopleMap.get(documented.personId) : undefined;
        return [s.id, person ? { name: resolveMember(person.id, person.name).name, personId: person.id } : documented];
    }));
    // Who presided at the meeting: the first document that names one. The
    // meeting's ΠΡΟΕΔΡΟΣ line names this person when the president was absent
    // (`buildRollCall`), and a subject whose document names no one falls back to it.
    const presidedBy = sortedSubjects
        .map(s => documentedPresidedBy.get(s.id) ?? null)
        .find((p): p is NonNullable<typeof p> => p !== null) ?? null;

    // Build MinutesSubject for each
    const minutesSubjects: MinutesSubject[] = sortedSubjects.map((s) => {
        const ed = extractedDataMap.get(s.id);
        const attendance = ed && ed.attendance.length > 0
            ? buildAttendance(ed.attendance, mayorExcludedFromRows, resolveMember, getElectedOrder)
            : null;
        // No `ed` guard: a document can state its outcome in words and name no
        // voter at all, and that result comes from the phrase alone.
        const voteResult = buildVoteResult(
            ed?.votes ?? [], ed?.attendance ?? [], mayorExcludedFromRows, resolveMember, getElectedOrder,
            s.decision?.voteResultPhrase ?? null,
        );
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
                voteResultPhrase: s.decision.voteResultPhrase ?? null,
            } : null,
            presidedBy: documentedPresidedBy.get(s.id) ?? presidedBy,
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
            regularMembers, substituteMembers, mayor, president, mayorExcludedFromRows, getElectedOrder,
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
            regularMembers, substituteMembers, mayor, president, mayorExcludedFromRows, getElectedOrder,
        );
    }


    if (councilCompositionResult) councilCompositionResult.presidedBy = presidedBy;
    const presidentPersonId = president?.personId ?? null;
    const someoneElsePresided = presidentPersonId !== null && presidentStandIn(
        presidentPersonId,
        meetingAttendance.some(a => a.personId === presidentPersonId && a.status === 'ABSENT'),
        presidedBy,
    ) !== null;

    // Arrivals and departures: from the events the documents state when we hold
    // them, else reconstructed from per-subject attendance diffs (older polls).
    const storedEvents = await getAttendanceEventsForMeeting(cityId, meetingId);
    const attendanceChangesSource = storedEvents.length > 0 ? 'events' : 'diff';
    // The mayor's own arrivals and departures print in the mayor's note, not in
    // the list, when the note has a line: the ΔΗΜΑΡΧΟΣ line of a mayor who is
    // not a member, or the ΠΡΟΕΔΡΟΣ line of a committee the mayor presides, as
    // the minutes print «ΠΡΟΕΔΡΟΣ: … (ΔΗΜΑΡΧΟΣ)». A member mayor who does not
    // preside has no line, so their changes stay in the list. So do the changes
    // of an absent presiding mayor whose line names who presided instead.
    const mayorPresides = mayorPersonId !== null && presidentPersonId === mayorPersonId && !someoneElsePresided;
    const mayorWithNoteChanges = mayorExcludedFromRows ?? (mayorPresides ? mayorPersonId : null);
    let attendanceChanges: MinutesAttendanceChange[];
    let mayorChanges: MayorChange[];
    if (attendanceChangesSource === 'events') {
        const fromEvents = buildAttendanceChangesFromEvents(
            storedEvents,
            minutesSubjects.filter(s => !s.withdrawn).map(s => ({
                subjectId: s.subjectId, name: s.name, agendaItemIndex: s.agendaItemIndex, nonAgendaReason: s.nonAgendaReason,
                attendance: s.attendance, decisionNumber: s.decision?.decisionNumber ?? null,
            })),
            (personId) => {
                const person = peopleMap.get(personId);
                return person ? resolveMember(personId, person.name) : null;
            },
            mayorWithNoteChanges,
        );
        attendanceChanges = fromEvents.changes;
        mayorChanges = fromEvents.mayorChanges;
    } else {
        const fromDiff = buildAttendanceChanges(
            minutesSubjects.filter(s => !s.withdrawn),
            absentMembers,
            mayorWithNoteChanges,
        );
        attendanceChanges = fromDiff.changes;
        mayorChanges = fromDiff.mayorChanges;
    }

    // What the mayor's line says after the name: the ΔΗΜΑΡΧΟΣ line, or the
    // ΠΡΟΕΔΡΟΣ line of a committee the mayor presides. The roll call is the meeting's
    // own attendance row.
    if (councilCompositionResult?.mayor) {
        const mayorRollCall = meetingAttendance.find(a => a.personId === mayorPersonId)?.status ?? null;
        councilCompositionResult.mayor.note = buildMayorNote(
            mayorRollCall,
            mayorChanges,
            mayorPerson ? isFemaleName(extractFirstName(mayorPerson.name)) : false,
        );
    }

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
        attendanceChangesSource,
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
