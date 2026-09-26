import { AttendanceStatus, DiscussionStatus, VoteType } from '@prisma/client';
import { compareRanks } from '@/lib/sorting/people';
import { extractFirstName, formatSurnameFirst, getAbsentLabel } from '@/lib/formatters/name';
import { calculateVoteResult, getAbsentNonVoterIds } from '@/lib/utils/votes';
import { splitAttendance } from '@/lib/utils/attendance';
import { isRecordSubject } from '@/lib/utils/subjects';
import { phrasePermitsInference, phraseOutcome, type PhraseOutcome } from '@/lib/derivation/deriveVotes';
import { decisionOrdinal, placeEvents, type PlaceableEvent } from '@/lib/derivation/placeEvents';
import {
    MinutesMember,
    MinutesAttendance,
    MinutesVoteResult,
    MinutesCouncilComposition,
    MinutesAttendanceChange,
    MinutesDiscussionSummary,
    MinutesProceduralVote,
    MinutesRollCall,
    MinutesRollCallMember,
} from './types';

// --- Dependency types for testability ---

/** Resolves a person's display info (party, role) from their roles at a specific date. */
export type MemberResolver = (personId: string, fallbackName: string) => MinutesMember;

/** Gets the elected order for a person (for sort ordering). */
export type ElectedOrderGetter = (personId: string) => number | null;

// --- Shared helpers ---

/** Sort comparator: elected order ascending (nulls last), then name alphabetically. */
export function sortByElectedOrder(
    a: MinutesMember,
    b: MinutesMember,
    getElectedOrder: ElectedOrderGetter,
): number {
    const orderCompare = compareRanks(getElectedOrder(a.personId), getElectedOrder(b.personId));
    if (orderCompare !== 0) return orderCompare;
    return a.name.localeCompare(b.name);
}

/**
 * Merge regular and substitute members so each substitute appears right after
 * the last regular member of the same party. Substitutes whose party doesn't
 * match any regular member are appended at the end.
 */
export function interleaveSubstitutes(
    members: MinutesMember[],
    substituteMembers: MinutesMember[],
): MinutesMember[] {
    if (substituteMembers.length === 0) return members;

    const result: MinutesMember[] = [];
    // Group substitutes by party
    const subsByParty = new Map<string | null, MinutesMember[]>();
    for (const sub of substituteMembers) {
        const key = sub.party;
        const list = subsByParty.get(key) || [];
        list.push(sub);
        subsByParty.set(key, list);
    }

    // Track which parties we've already flushed substitutes for
    const flushed = new Set<string | null>();

    for (let i = 0; i < members.length; i++) {
        result.push(members[i]);
        const party = members[i].party;
        // Check if next member has a different party (or this is the last member)
        const isLastOfParty = i === members.length - 1 || members[i + 1].party !== party;
        if (isLastOfParty && subsByParty.has(party) && !flushed.has(party)) {
            result.push(...subsByParty.get(party)!);
            flushed.add(party);
        }
    }

    // Append any substitutes whose party didn't match any regular member
    for (const [party, subs] of subsByParty) {
        if (!flushed.has(party)) {
            result.push(...subs);
        }
    }

    return result;
}

// --- Builders ---

/**
 * Splits extracted attendance data into present/absent MinutesMember arrays.
 * Excludes the mayor (shown separately in council composition).
 * Sorted by elected order.
 */
export function buildAttendance(
    attendance: Array<{ personId: string; personName: string; status: AttendanceStatus }>,
    mayorPersonId: string | null,
    resolveMember: MemberResolver,
    getElectedOrder: ElectedOrderGetter,
): MinutesAttendance {
    const sorted = [...attendance].sort((a, b) =>
        compareRanks(getElectedOrder(a.personId), getElectedOrder(b.personId))
        || a.personName.localeCompare(b.personName)
    );
    const { present, absent } = splitAttendance(sorted, mayorPersonId);
    const toMembers = (rows: typeof sorted): MinutesMember[] =>
        rows.map(a => resolveMember(a.personId, a.personName));

    return { present: toMembers(present), absent: toMembers(absent) };
}

/**
 * Builds vote result from extracted vote + attendance data.
 * Derives absent members as: those in attendance who are absent AND didn't vote (excluding mayor).
 *
 * With no votes there is still a result when the document states one in words
 * («Ομόφωνα») — nobody was named, so there are no lists at all and the result
 * carries the phrase with whatever outcome it names. Returns null when there is
 * neither.
 *
 * Only a phrase that states an outcome counts: `voteResultPhrase` is the
 * extractor's verbatim field and often holds something else entirely
 * («ΑΝΑΒΑΛΛΕΙ»), which must print no vote line rather than a fabricated one.
 * `phrasePermitsInference` is the same predicate the derivation asks.
 */
export function buildVoteResult(
    votes: Array<{ personId: string; personName: string; voteType: VoteType }>,
    attendance: Array<{ personId: string; personName: string; status: AttendanceStatus }>,
    mayorPersonId: string | null,
    resolveMember: MemberResolver,
    getElectedOrder: ElectedOrderGetter,
    phrase: string | null = null,
): MinutesVoteResult | null {
    // No FOR row under a phrase that says a vote carried is the derivation
    // declining to infer: the page counts in favour without naming, and the
    // members present do not fit that count. The rows then hold only the named
    // dissent, and counting them would print a carried decision as rejected.
    const permits = !!phrase && phrasePermitsInference(phrase);
    if (!votes.some(v => v.voteType === 'FOR') && permits) {
        return {
            forMembers: [], againstMembers: [], abstainMembers: [], presentMembers: [], didNotVoteMembers: [], absentMembers: [],
            fromPhraseOnly: true, outcome: phraseOutcome(phrase), phrase,
        };
    }
    if (votes.length === 0) return null;

    const sortedVotes = [...votes].sort((a, b) =>
        compareRanks(getElectedOrder(a.personId), getElectedOrder(b.personId))
        || a.personName.localeCompare(b.personName)
    );

    const forMembers: MinutesMember[] = [];
    const againstMembers: MinutesMember[] = [];
    const abstainMembers: MinutesMember[] = [];
    const presentMembers: MinutesMember[] = [];
    const didNotVoteMembers: MinutesMember[] = [];

    const voterIds = new Set<string>();
    for (const v of sortedVotes) {
        voterIds.add(v.personId);
        const member = resolveMember(v.personId, v.personName);

        switch (v.voteType) {
            case 'FOR': forMembers.push(member); break;
            case 'AGAINST': againstMembers.push(member); break;
            case 'ABSTAIN': abstainMembers.push(member); break;
            case 'PRESENT': presentMembers.push(member); break;
            case 'DID_NOT_VOTE': didNotVoteMembers.push(member); break;
        }
    }

    // Absent members: those in attendance who are absent and didn't vote (excluding mayor)
    const absentIds = getAbsentNonVoterIds(attendance, voterIds, mayorPersonId);
    const absentMembers = attendance
        .filter(a => absentIds.has(a.personId))
        .sort((a, b) =>
            compareRanks(getElectedOrder(a.personId), getElectedOrder(b.personId))
            || a.personName.localeCompare(b.personName)
        )
        .map(a => resolveMember(a.personId, a.personName));

    const { passed, isUnanimous } = calculateVoteResult(votes);

    return { forMembers, againstMembers, abstainMembers, presentMembers, didNotVoteMembers, absentMembers, passed, isUnanimous, fromPhraseOnly: false };
}

/**
 * Builds the overall composition for the meeting body.
 * Pure structural data — no attendance dependency. Lists all members
 * sorted by elected order, plus mayor and president.
 *
 * For committees, members are split into regular (τακτικά) and substitute
 * (αναπληρωματικά) — the caller provides them pre-split.
 *
 * @param members - Regular members resolved as MinutesMember
 * @param substituteMembers - Substitute members (αναπληρωματικά μέλη)
 * @param mayor - Mayor info, or null if not found
 * @param president - Council president info, or null if not found
 * @param mayorPersonId - A mayor who is not a member of the body, left out of the
 *   member lists (the ΔΗΜΑΡΧΟΣ line names them); null keeps a member mayor in them
 * @param getElectedOrder - Resolver for council election order
 */
export function buildCouncilComposition(
    members: MinutesMember[],
    substituteMembers: MinutesMember[],
    mayor: { name: string; personId: string } | null,
    president: { name: string; personId: string } | null,
    mayorPersonId: string | null,
    getElectedOrder: ElectedOrderGetter,
): MinutesCouncilComposition {
    // note is filled in by the caller, which knows the roll call and the mayor's own movement.
    const mayorResult: MinutesCouncilComposition['mayor'] = mayor
        ? { name: formatSurnameFirst(mayor.name), personId: mayor.personId, note: null }
        : null;

    const presidentResult: MinutesCouncilComposition['president'] = president
        ? { name: formatSurnameFirst(president.name), personId: president.personId }
        : null;

    const sortedMembers = members
        .filter(m => m.personId !== mayorPersonId)
        .sort((a, b) => sortByElectedOrder(a, b, getElectedOrder));

    const sortedSubstitutes = substituteMembers
        .filter(m => m.personId !== mayorPersonId)
        .sort((a, b) => sortByElectedOrder(a, b, getElectedOrder));

    return { mayor: mayorResult, president: presidentResult, members: sortedMembers, substituteMembers: sortedSubstitutes };
}

/**
 * The roll call the minutes print, from the composition and who was absent.
 *
 * A council gets the ΔΗΜΑΡΧΟΣ line, then the ΠΡΟΕΔΡΟΣ line; its lists are the
 * ΣΥΝΘΕΣΗ members, and the absence sentence leaves the president out. A
 * council's lists never hold the mayor: `buildCouncilComposition` leaves out a
 * mayor who is not a member, and on a council the mayor never is.
 *
 * A committee gets no ΔΗΜΑΡΧΟΣ line. A mayor who is a member of the committee
 * is an ordinary member, and the lists count the mayor. When the mayor
 * presides, the president's line adds «(ΔΗΜΑΡΧΟΣ)» and the mayor's note, as
 * the minutes print it: the absence at the roll call, the mayor's arrivals and
 * departures, and who presided in the mayor's place. `getMinutesData` then
 * keeps the mayor's arrivals and departures out of the changes list, so
 * nothing prints twice. A member mayor who does not preside has no line of
 * their own, and their arrivals and departures are in the changes list, like
 * any member's. A mayor who is not a member of the committee is not printed at all.
 * Its lists are the members and the substitutes, the substitutes after their
 * party (`interleaveSubstitutes`).
 *
 * `absentIds` is who was absent at the point the lines describe: the roll call
 * for the minutes, or one subject for the decisions page.
 */
export function buildRollCall(
    composition: MinutesCouncilComposition,
    absentIds: ReadonlySet<string>,
    bodyType: string | null,
): MinutesRollCall {
    const isCommittee = bodyType === 'committee';
    const absentLabel = (name: string) => getAbsentLabel(extractFirstName(name, 'surnameFirst'));

    const mayor: MinutesRollCall['mayor'] = !isCommittee && composition.mayor
        ? (() => {
            const { name, personId, note } = composition.mayor;
            const absent = absentIds.has(personId);
            return { name, personId, absent, note, printedNote: note ?? (absent ? absentLabel(name) : null) };
        })()
        : null;

    const president: MinutesRollCall['president'] = composition.president
        ? (() => {
            const { name, personId } = composition.president;
            const absent = absentIds.has(personId);
            const isMayor = isCommittee && personId === composition.mayor?.personId;
            // A mayor who presides has no ΔΗΜΑΡΧΟΣ line, so their note goes on this one.
            const note = isMayor ? composition.mayor?.note ?? null : null;
            return { name, personId, absent, isMayor, note, printedNote: note ?? (absent ? absentLabel(name) : null) };
        })()
        : null;

    const substituteIds = new Set(composition.substituteMembers.map(m => m.personId));
    const pool: MinutesRollCallMember[] = interleaveSubstitutes(composition.members, composition.substituteMembers)
        .map(member => ({ member, isSubstitute: substituteIds.has(member.personId) }));
    const present = pool.filter(m => !absentIds.has(m.member.personId));
    const absent = pool.filter(m => absentIds.has(m.member.personId)
        && (isCommittee || m.member.personId !== composition.president?.personId));

    return { isCommittee, mayor, president, present, absent };
}

/**
 * The parenthesis after a member's name in the minutes' lists: «αναπλ. μέλος»
 * for a substitute, then the party, with «Επικεφαλής» for its head.
 */
export function formatRollCallMemberLabel({ member, isSubstitute }: MinutesRollCallMember): string | null {
    const labels: string[] = [];
    if (isSubstitute) labels.push('αναπλ. μέλος');
    if (member.party) labels.push(member.isPartyHead ? `${member.party}, Επικεφαλής` : member.party);
    return labels.length > 0 ? labels.join(', ') : null;
}

/** One of the mayor's own arrivals or departures, worded for the mayor's note. */
export type MayorChange = { type: 'arrival' | 'departure'; label: string };

/**
 * The parenthesis after the mayor's name — on the ΔΗΜΑΡΧΟΣ line, or on the
 * ΠΡΟΕΔΡΟΣ line of a committee the mayor presides: absent/present at the roll
 * call, their own arrivals or departures, and who presided in their absence.
 */
export function buildMayorNote(
    rollCallStatus: 'PRESENT' | 'ABSENT' | null,
    mayorChanges: MayorChange[],
    presidedByName: string | null,
    feminine: boolean,
): string | null {
    const parts: string[] = [];
    if (rollCallStatus === 'ABSENT') parts.push(feminine ? 'ΑΠΟΥΣΑ' : 'ΑΠΩΝ');
    for (const c of mayorChanges) parts.push(`${c.type === 'arrival' ? 'προσήλθε' : 'αποχώρησε'} ${c.label}`);
    if (rollCallStatus === 'ABSENT' && presidedByName) parts.push(`προήδρευσε ${presidedByName}`);
    return parts.length ? parts.join(', ') : null;
}

/**
 * True when a ΔΗΜΑΡΧΟΣ note says the mayor was absent at the roll call.
 * buildMayorNote puts ΑΠΩΝ/ΑΠΟΥΣΑ as the note's own first part, whole,
 * followed by nothing else or a ", " before the next part — so the mayor is
 * absent at the roll call exactly when the note opens with one of the two.
 *
 * `\b` is ASCII-only in JavaScript and never matches after a Greek letter, so
 * the two full words are spelled out rather than shared through a `\b`-bounded
 * prefix.
 */
export function mayorAbsentFromNote(note: string | null | undefined): boolean {
    return /^(ΑΠΩΝ|ΑΠΟΥΣΑ)(,|$)/.test(note ?? '');
}



/**
 * Arrivals and departures from the events the documents state, printed at the
 * subject the anchor resolves to. Which subject that is, is `placeEvents` — the
 * same placement the derivation writes the rows with, so a sentence cannot name
 * one item while another item's attendance table shows the change. An event with
 * no effect on any item (an «after» past the last subject) prints nothing.
 *
 * What is this function's own: the Greek label a decision-number or phase anchor
 * prints instead of the item, and the fallback for an anchor `placeEvents` could
 * not place — the first subject whose attendance already shows the member on the
 * other side. Session-start arrivals and session-end departures are not changes
 * and are skipped.
 *
 * `mayorPersonId` is a mayor whose note prints the mayor's own changes, else
 * null. See `splitMayorChanges` for which mayor that is.
 */
export function buildAttendanceChangesFromEvents(
    events: PlaceableEvent[],
    subjects: Array<{
        subjectId: string;
        name: string;
        agendaItemIndex: number | null;
        nonAgendaReason: 'beforeAgenda' | 'outOfAgenda' | null;
        attendance: MinutesAttendance | null;
        decisionNumber: string | null;
    }>,
    resolveMember: (personId: string) => MinutesMember | null,
    mayorPersonId: string | null,
): { changes: MinutesAttendanceChange[]; mayorChanges: MayorChange[] } {
    const oaIndexMap = new Map<string, number>();
    let oaCounter = 0;
    for (const s of subjects) if (s.nonAgendaReason === 'outOfAgenda') oaIndexMap.set(s.subjectId, ++oaCounter);
    const atSubject = (s: typeof subjects[number]): MinutesAttendanceChange['atSubject'] => ({
        id: s.subjectId, name: s.name, agendaItemIndex: s.agendaItemIndex, nonAgendaReason: s.nonAgendaReason,
        outOfAgendaIndex: oaIndexMap.get(s.subjectId) ?? null,
    });

    const effectAt = new Map<PlaceableEvent, number>();
    for (const p of placeEvents(subjects.map(s => ({
        id: s.subjectId, name: s.name, agendaItemIndex: s.agendaItemIndex, nonAgendaReason: s.nonAgendaReason, decisionNumber: s.decisionNumber,
    })), events).placed) effectAt.set(p.event, p.effectAt);

    const changes: MinutesAttendanceChange[] = [];
    for (const e of events) {
        if (e.anchorKind === 'SESSION_START' || e.anchorKind === 'SESSION_END') continue;
        const member = resolveMember(e.personId);
        if (!member) continue;
        const type = e.kind === 'ARRIVAL' ? 'arrival' : 'departure';
        let anchorLabel: string | null = null;
        if (e.anchorKind === 'DECISION_NUMBER' && decisionOrdinal(e.anchorDecisionNumber) != null) {
            anchorLabel = `στην ${e.anchorDecisionNumber} ΑΚΣ`;
        } else if (e.anchorKind === 'PHASE') {
            anchorLabel = e.anchorPhase === 'OUT_OF_AGENDA' ? 'κατά τα θέματα εκτός ημερήσιας διάταξης' : 'πριν την ημερήσια διάταξη';
        }
        let index = effectAt.get(e) ?? -1;
        // Past the last subject: the change touches no item's attendance, so
        // printing it against one would contradict the table beside it.
        if (index >= subjects.length) continue;
        if (index < 0) {
            // Unplaceable anchor: the first subject whose attendance already shows the member on the other side.
            index = subjects.findIndex(s => s.attendance && (type === 'departure'
                ? s.attendance.absent.some(m => m.personId === e.personId)
                : s.attendance.present.some(m => m.personId === e.personId)));
        }
        if (index < 0) continue;
        changes.push({ personId: e.personId, name: member.name, type, atSubject: atSubject(subjects[index]), anchorLabel, rawText: e.rawText });
    }
    return splitMayorChanges(changes, mayorPersonId);
}

/**
 * Takes the mayor's own arrivals and departures out of the changes list, worded
 * for the mayor's note. `mayorPersonId` is the mayor whose note prints them: a
 * mayor who is not a member of the body (the ΔΗΜΑΡΧΟΣ line), or a committee
 * member mayor who presides (the ΠΡΟΕΔΡΟΣ line). Pass null for a member mayor
 * who does not preside: that mayor has no line, and their changes stay in the
 * list, like any member's.
 */
function splitMayorChanges(
    all: MinutesAttendanceChange[],
    mayorPersonId: string | null,
): { changes: MinutesAttendanceChange[]; mayorChanges: MayorChange[] } {
    const changes: MinutesAttendanceChange[] = [];
    const mayorChanges: MayorChange[] = [];
    for (const c of all) {
        if (c.personId === mayorPersonId) mayorChanges.push({ type: c.type, label: formatChangePosition(c) });
        else changes.push(c);
    }
    return { changes, mayorChanges };
}

/**
 * Computes mid-meeting attendance changes by diffing per-subject attendance
 * across consecutive subjects in discussion order.
 *
 * Also compares the initial roll call against the first subject's attendance
 * to catch arrivals/departures that happen during the first discussed subject
 * (which have no preceding subject to diff against).
 *
 * A person who is present in subject N but absent in subject N+1 is a departure
 * (detected at subject N+1). A person absent in N but present in N+1 is an arrival.
 *
 * `mayorPersonId` splits the mayor's own changes out, as in
 * `buildAttendanceChangesFromEvents` (see `splitMayorChanges`).
 */
export function buildAttendanceChanges(
    subjects: Array<{
        subjectId: string;
        name: string;
        agendaItemIndex: number | null;
        nonAgendaReason: 'beforeAgenda' | 'outOfAgenda' | null;
        attendance: MinutesAttendance | null;
    }>,
    /** Initial roll call — absent members at session start. Used to detect changes at the first discussed subject. */
    initialAbsentMembers: MinutesMember[] | null,
    mayorPersonId: string | null,
): { changes: MinutesAttendanceChange[]; mayorChanges: MayorChange[] } {
    const changes: MinutesAttendanceChange[] = [];

    // Pre-compute OA sequential indices (1-based)
    const oaIndexMap = new Map<string, number>();
    let oaCounter = 0;
    for (const s of subjects) {
        if (s.nonAgendaReason === 'outOfAgenda') {
            oaCounter++;
            oaIndexMap.set(s.subjectId, oaCounter);
        }
    }

    const buildAtSubject = (s: typeof subjects[number]) => ({
        id: s.subjectId,
        name: s.name,
        agendaItemIndex: s.agendaItemIndex,
        nonAgendaReason: s.nonAgendaReason,
        outOfAgendaIndex: oaIndexMap.get(s.subjectId) ?? null,
    });

    // Compare initial roll call against first subject's attendance.
    // Catches arrivals (initially absent → present) and departures
    // (initially present → absent) during the first discussed subject.
    const firstWithAttendance = subjects.find(s => s.attendance);
    if (firstWithAttendance?.attendance && initialAbsentMembers) {
        const initialAbsentIds = new Set(initialAbsentMembers.map(m => m.personId));
        const atSubject = buildAtSubject(firstWithAttendance);

        // Arrivals: initially absent → present at first subject
        for (const member of firstWithAttendance.attendance.present) {
            if (initialAbsentIds.has(member.personId)) {
                changes.push({ personId: member.personId, name: member.name, type: 'arrival', atSubject });
            }
        }

        // Departures: initially present (not in absent list) → absent at first subject
        for (const member of firstWithAttendance.attendance.absent) {
            if (!initialAbsentIds.has(member.personId)) {
                changes.push({ personId: member.personId, name: member.name, type: 'departure', atSubject });
            }
        }
    }

    // Diff consecutive subjects
    for (let i = 1; i < subjects.length; i++) {
        const prev = subjects[i - 1];
        const curr = subjects[i];
        if (!prev.attendance || !curr.attendance) {
            if (prev.attendance || curr.attendance) {
                console.warn(`[buildAttendanceChanges] Gap in attendance data at subject "${curr.name}"`);
            }
            continue;
        }

        const currAbsentIds = new Set(curr.attendance.absent.map(m => m.personId));
        const currPresentIds = new Set(curr.attendance.present.map(m => m.personId));
        const atSubject = buildAtSubject(curr);

        // Departures: present in prev, absent in curr
        for (const member of prev.attendance.present) {
            if (currAbsentIds.has(member.personId)) {
                changes.push({ personId: member.personId, name: member.name, type: 'departure', atSubject });
            }
        }

        // Arrivals: absent in prev, present in curr
        for (const member of prev.attendance.absent) {
            if (currPresentIds.has(member.personId)) {
                changes.push({ personId: member.personId, name: member.name, type: 'arrival', atSubject });
            }
        }
    }

    return splitMayorChanges(changes, mayorPersonId);
}

interface SortableSubject {
    id: string;
    agendaItemIndex: number | null;
    nonAgendaReason: string | null;
    discussedIn: { id: string } | null;
}

/**
 * Sorts subjects by discussion order (transcript timestamp), with fallbacks:
 * - Subjects with transcript come first, sorted by timestamp
 * - "discussedIn" subjects inherit their parent's timestamp, sorted after the parent
 * - Subjects without transcript are interleaved by agenda position among
 *   timestamped subjects, placed where they'd naturally appear in the sequence
 */
export function sortSubjectsByDiscussionOrder<T extends SortableSubject>(
    subjects: T[],
    firstUtteranceBySubject: Map<string, number>,
): T[] {
    function getDiscussionTime(s: T): number | undefined {
        if (s.discussedIn) return firstUtteranceBySubject.get(s.discussedIn.id);
        return firstUtteranceBySubject.get(s.id);
    }

    // Separate into timestamped and non-timestamped
    const withTime = subjects.filter(s => getDiscussionTime(s) !== undefined);
    const withoutTime = subjects.filter(s => getDiscussionTime(s) === undefined);

    // Sort timestamped subjects
    const sortedWithTime = [...withTime].sort((a, b) => {
        const aTime = getDiscussionTime(a)!;
        const bTime = getDiscussionTime(b)!;
        if (aTime !== bTime) return aTime - bTime;
        const aIsChild = a.discussedIn != null;
        const bIsChild = b.discussedIn != null;
        if (aIsChild !== bIsChild) return aIsChild ? 1 : -1;
        return (a.agendaItemIndex ?? 0) - (b.agendaItemIndex ?? 0);
    });

    if (withoutTime.length === 0) return sortedWithTime;

    // Sort non-timestamped by agenda order
    const sortedWithoutTime = [...withoutTime].sort((a, b) => {
        const aIsOOA = a.nonAgendaReason === 'outOfAgenda';
        const bIsOOA = b.nonAgendaReason === 'outOfAgenda';
        if (aIsOOA && !bIsOOA) return 1;
        if (!aIsOOA && bIsOOA) return -1;
        return (a.agendaItemIndex ?? 0) - (b.agendaItemIndex ?? 0);
    });

    // Interleave: insert each non-timestamped subject at its natural agenda position
    const result = [...sortedWithTime];
    for (const s of sortedWithoutTime) {
        const agendaIdx = s.agendaItemIndex ?? Infinity;
        const isOOA = s.nonAgendaReason === 'outOfAgenda';

        // Find insertion point: after the last timestamped subject with a lower agenda index.
        // Default to 0 (beginning) — if no subject has a lower index, this one goes first.
        let insertAt = 0;
        for (let i = result.length - 1; i >= 0; i--) {
            const existing = result[i];
            const existingIsOOA = existing.nonAgendaReason === 'outOfAgenda';
            const existingIdx = existing.agendaItemIndex ?? 0;

            if (isOOA === existingIsOOA && existingIdx <= agendaIdx) {
                insertAt = Math.max(insertAt, i + 1);
                break;
            }
            if (!isOOA && existingIsOOA) {
                // OOA items that were discussed (have timestamps) stay in place.
                // Don't insert before them — record as floor, keep searching
                // for a regular subject with a lower agenda index.
                insertAt = Math.max(insertAt, i + 1);
                continue;
            }
            if (isOOA && !existingIsOOA) {
                insertAt = i + 1;
                break;
            }
        }
        result.splice(insertAt, 0, s);
    }

    return result;
}

/**
 * The meeting's subjects as the record walks them: the record subjects
 * (`isRecordSubject` — agenda plus out-of-agenda, never `beforeAgenda`) in
 * discussion order.
 *
 * One helper because the sequence is an index: an «after item 3» anchor is
 * placed by position, so a caller walking a different set, or the same set in a
 * different order, puts the change on a different subject than the page prints
 * it against. The minutes and the derivation both come through here. Withdrawn
 * subjects are kept — the minutes list them in the table of contents; callers
 * that place events drop them.
 */
export function orderedMinutesSubjects<T extends SortableSubject>(
    subjects: T[],
    firstUtteranceBySubject: Map<string, number>,
): T[] {
    return sortSubjectsByDiscussionOrder(subjects.filter(isRecordSubject), firstUtteranceBySubject);
}

/**
 * Withdrawn/rejected label for the minutes table of contents.
 *
 * The minutes are Greek by construction — Greek headings, Greek date locale,
 * ΑΔΑ/ΚΗΜΔΗΣ identifiers — and are never rendered outside the Greek realm, so
 * this stays out of the i18n catalogue. Shared by the docx renderer and the
 * on-screen preview, which draw the same table and must not drift apart. The
 * localised equivalent for the rest of the app is getWithdrawnLabel in
 * @/lib/utils/subjects.
 */
export function getWithdrawnLabelGreek(subject: { nonAgendaReason: string | null }): string {
    return subject.nonAgendaReason === 'outOfAgenda' ? 'Δεν εγκρίθηκε' : 'Αποσύρθηκε';
}

/**
 * Formats a subject reference for display in attendance change sections.
 *
 * Greek-only for the same reason as `getWithdrawnLabelGreek` above: the
 * minutes are Greek by construction and never render outside the Greek
 * realm, so this stays out of the i18n catalogue.
 */
export function formatSubjectLabel(atSubject: MinutesAttendanceChange['atSubject']): string {
    if (atSubject.nonAgendaReason === 'outOfAgenda' && atSubject.outOfAgendaIndex != null) {
        return `${atSubject.outOfAgendaIndex}ο εκτός ημερήσιας`;
    }
    if (atSubject.agendaItemIndex != null) {
        return `${atSubject.agendaItemIndex}ο θέμα`;
    }
    return atSubject.name;
}

/**
 * Where a change happened, as a phrase that can follow a name or a verb:
 * «στην 286 ΑΚΣ» when the document pinned it to something other than an agenda
 * item, «από το 5ο θέμα» otherwise — `atSubject` is the subject the member is
 * first seen on the other side of, so the preposition has to be «από», not a
 * bare label. One helper so the Προσελεύσεις/Αποχωρήσεις lists and the
 * ΔΗΜΑΡΧΟΣ parenthesis cannot word the same fact differently.
 */
export function formatChangePosition(
    change: { anchorLabel?: string | null; atSubject: MinutesAttendanceChange['atSubject'] },
): string {
    return change.anchorLabel ?? `από το ${formatSubjectLabel(change.atSubject)}`;
}

/**
 * The whole vote line for a result that is only a phrase: the document named
 * nobody, so there are no member lists to print and the outcome stands alone.
 *
 * A phrase that names no outcome prints as the page wrote it. Vrilissia states
 * «Με πέντε (5) θετικές ψήφους» for a vote nobody opposed and somebody sat
 * out as ΠΑΡΩΝ — neither «ομόφωνα» nor «κατά πλειοψηφία», which is why it
 * uses no outcome word. Athens calls the same vote state «Κατά πλειοψηφία», so
 * printing that word here would assert one municipality's convention on
 * another's page. Greek-only for the same reason as `getWithdrawnLabelGreek`
 * above.
 */
export function formatPhraseOnlyOutcome(voteResult: { outcome: PhraseOutcome | null; phrase: string }): string {
    if (voteResult.outcome === 'unanimous') return 'Ομόφωνα';
    if (voteResult.outcome === 'majority') return 'Κατά πλειοψηφία';
    return voteResult.phrase;
}

export interface SummaryUtterance {
    startTimestamp: number;
    endTimestamp: number;
    discussionStatus: DiscussionStatus | null;
}

/**
 * The transcript's account of one subject: see MinutesDiscussionSummary.
 * Takes the utterances linked to the subject (discussionSubjectId), any status.
 */
export function buildDiscussionSummary(utterances: SummaryUtterance[]): MinutesDiscussionSummary {
    let seconds = 0;
    let hasDiscussion = false;
    let hasVote = false;
    let start: number | null = null;
    let proceduralStart: number | null = null;
    for (const u of utterances) {
        if (u.discussionStatus === 'PROCEDURAL_VOTE') {
            if (proceduralStart === null || u.startTimestamp < proceduralStart) proceduralStart = u.startTimestamp;
            continue;
        }
        if (start === null || u.startTimestamp < start) start = u.startTimestamp;
        if (u.discussionStatus === 'SUBJECT_DISCUSSION') {
            hasDiscussion = true;
            seconds += Math.max(0, u.endTimestamp - u.startTimestamp);
        } else if (u.discussionStatus === 'VOTE') {
            hasVote = true;
        }
    }
    const kind = hasDiscussion ? 'discussed' : hasVote ? 'voteOnly' : utterances.length > 0 ? 'other' : 'none';
    return { kind, seconds, start: start ?? proceduralStart };
}

export function buildProceduralVotes(
    utterances: Array<{ startTimestamp: number; discussionStatus: DiscussionStatus | null; discussionSubjectId: string | null }>,
    subjects: Array<{ id: string; name: string; agendaItemIndex: number | null; nonAgendaReason: 'outOfAgenda' | null }>,
): MinutesProceduralVote[] {
    const byId = new Map(subjects.map(s => [s.id, s]));
    const first = new Map<string, number>();
    for (const u of utterances) {
        if (u.discussionStatus !== 'PROCEDURAL_VOTE' || !u.discussionSubjectId) continue;
        if (!byId.has(u.discussionSubjectId)) continue;
        const seen = first.get(u.discussionSubjectId);
        if (seen === undefined || u.startTimestamp < seen) first.set(u.discussionSubjectId, u.startTimestamp);
    }
    return [...first]
        .map(([subjectId, timestamp]) => ({ subjectId, timestamp }))
        .sort((a, b) => a.timestamp - b.timestamp);
}
