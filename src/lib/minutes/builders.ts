import { AttendanceStatus, DiscussionStatus, VoteType } from '@prisma/client';
import { compareRanks } from '@/lib/sorting/people';
import { extractFirstName, formatSurnameFirst, getAbsentLabel, isFemaleName } from '@/lib/formatters/name';
import { calculateVoteResult, getAbsentNonVoterIds } from '@/lib/utils/votes';
import { splitAttendance } from '@/lib/utils/attendance';
import { isRecordSubject } from '@/lib/utils/subjects';
import { phrasePermitsInference, phraseOutcome, type PhraseOutcome } from '@/lib/derivation/deriveVotes';
import { decisionOrdinal, placeEvents, type PlaceableEvent } from '@/lib/derivation/placeEvents';
import { collapseOrderRuns, type OrderPosition } from '@/lib/utils/discussionOrder';
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
    MinutesRollCallOffice,
} from './types';
import { assignUtterances, computeTemporalWindows, discussionSpans, type AssignmentResult, type SpanUtterance, type TemporalWindow, type WindowUtterance } from './temporalWindows';

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
 * Who presided in the president's place at the roll call: the person the
 * documents say presided (the meeting's `MinutesCouncilComposition.presidedBy`,
 * or one subject's `MinutesSubject.presidedBy`), when the
 * president was absent and that person is someone else. Null otherwise, and
 * the ΠΡΟΕΔΡΟΣ line then names the president.
 *
 * `buildRollCall` prints the ΠΡΟΕΔΡΟΣ line from this, and `getMinutesData`
 * reads it to decide where a presiding mayor's own arrivals and departures print.
 */
export function presidentStandIn(
    presidentPersonId: string,
    presidentAbsent: boolean,
    presidedBy: { name: string; personId: string | null } | null,
): { name: string; personId: string | null } | null {
    if (!presidentAbsent || !presidedBy) return null;
    return presidedBy.personId === presidentPersonId ? null : presidedBy;
}

/**
 * The roll call the minutes print, from the composition and who was absent.
 *
 * A council gets the ΔΗΜΑΡΧΟΣ line, then the ΠΡΟΕΔΡΟΣ line; its lists are the
 * ΣΥΝΘΕΣΗ members, and the absence sentence leaves out an absent president
 * whose own line says they were absent. A council's lists never hold the
 * mayor: `buildCouncilComposition` leaves out a mayor who is not a member, and
 * on a council the mayor never is.
 *
 * A committee gets no ΔΗΜΑΡΧΟΣ line. A mayor who is a member of the committee
 * is an ordinary member, and the lists count the mayor. When the mayor
 * presides, the president's line adds «(ΔΗΜΑΡΧΟΣ)» and the mayor's note, as
 * the minutes print it: the absence at the roll call, and the mayor's arrivals
 * and departures. `getMinutesData` then keeps the mayor's arrivals and
 * departures out of the changes list, so nothing prints twice. A member mayor
 * who does not preside has no line of their own, and their arrivals and
 * departures are in the changes list, like any member's. A mayor who is not a
 * member of the committee is not printed at all. Its lists are the members and
 * the substitutes, the substitutes after their party (`interleaveSubstitutes`).
 *
 * When the president was absent and another person presided
 * (`presidentStandIn`), the ΠΡΟΕΔΡΟΣ line names that person first, and the
 * parenthesis names the absent president, with the mayor's office when the
 * president is the mayor. The line then carries no mayor's note:
 * `getMinutesData` puts that mayor's arrivals and departures in the changes
 * list. On a council and on a committee, the absent list then holds the
 * president with the office (`office`). When no document names who presided,
 * the line names the absent president, as before.
 *
 * `absentIds` is who was absent at the point the lines describe: the roll call
 * for the minutes, or one subject for the decisions page. `presidedBy` is who
 * the documents say presided at that point: the meeting's by default, or one
 * subject's (`MinutesSubject.presidedBy`), since a meeting's documents can name
 * different people.
 */
export function buildRollCall(
    composition: MinutesCouncilComposition,
    absentIds: ReadonlySet<string>,
    bodyType: string | null,
    presidedBy: { name: string; personId: string | null } | null = composition.presidedBy ?? null,
): MinutesRollCall {
    const isCommittee = bodyType === 'committee';
    const absentLabel = (name: string) => getAbsentLabel(extractFirstName(name, 'surnameFirst'));

    const mayor: MinutesRollCall['mayor'] = !isCommittee && composition.mayor
        ? (() => {
            const { name, personId, note } = composition.mayor;
            const absent = absentIds.has(personId);
            const feminine = isFemaleName(extractFirstName(name, 'surnameFirst'));
            return { name, personId, absent, feminine, note, printedNote: note ?? (absent ? absentLabel(name) : null) };
        })()
        : null;

    const president: MinutesRollCall['president'] = composition.president
        ? (() => {
            const { name, personId } = composition.president;
            const absent = absentIds.has(personId);
            const isMayor = isCommittee && personId === composition.mayor?.personId;
            const feminine = isFemaleName(extractFirstName(name, 'surnameFirst'));
            const standIn = presidentStandIn(personId, absent, presidedBy);
            if (standIn) {
                return {
                    name, personId, absent, isMayor, feminine, presidedBy: standIn, note: null,
                    printedName: standIn.name,
                    printedNote: `λόγω απουσίας ${feminine ? 'της' : 'του'} ΠΡΟΕΔΡΟΥ${isMayor ? ', ΔΗΜΑΡΧΟΥ' : ''} ${name}`,
                };
            }
            // A mayor who presides has no ΔΗΜΑΡΧΟΣ line, so their note goes on this one.
            const note = isMayor ? composition.mayor?.note ?? null : null;
            return {
                name, personId, absent, isMayor, feminine, presidedBy: null, note,
                printedName: isMayor ? `${name} (ΔΗΜΑΡΧΟΣ)` : name,
                printedNote: note ?? (absent ? absentLabel(name) : null),
            };
        })()
        : null;

    const substituteIds = new Set(composition.substituteMembers.map(m => m.personId));
    const pool: MinutesRollCallMember[] = interleaveSubstitutes(composition.members, composition.substituteMembers)
        .map(member => ({ member, isSubstitute: substituteIds.has(member.personId), office: null }));
    const present = pool.filter(m => !absentIds.has(m.member.personId));
    const presidentOffice: MinutesRollCallOffice | null = president ? { isMayor: president.isMayor, feminine: president.feminine } : null;
    const absent = pool
        .filter(m => absentIds.has(m.member.personId)
            && (isCommittee || m.member.personId !== president?.personId || president.presidedBy !== null))
        .map(m => m.member.personId === president?.personId ? { ...m, office: presidentOffice } : m);

    return { isCommittee, mayor, president, present, absent };
}

/**
 * One subject's roll call on the decisions page, from one snapshot: the
 * subject's own attendance (`MinutesSubject.attendance`) gives both the absent
 * ids and the extra people. The pool is the meeting's composition, and every
 * member of the subject's attendance that the composition does not hold. The
 * replay gives subject rows to a person that no roll call names (their first
 * event or a per-decision list puts them there), and that person votes, so the
 * block counts and names them as the vote tally does.
 *
 * With no composition (the minutes did not load), the lines are the subject's
 * own lists, with no ΔΗΜΑΡΧΟΣ or ΠΡΟΕΔΡΟΣ line.
 */
export function buildSubjectRollCall(
    composition: MinutesCouncilComposition | null,
    attendance: MinutesAttendance,
    bodyType: string | null,
    presidedBy: { name: string; personId: string | null } | null,
): MinutesRollCall {
    const absentIds = new Set(attendance.absent.map(m => m.personId));
    if (!composition) {
        const entry = (member: MinutesMember): MinutesRollCallMember => ({ member, isSubstitute: false, office: null });
        return { isCommittee: bodyType === 'committee', mayor: null, president: null, present: attendance.present.map(entry), absent: attendance.absent.map(entry) };
    }
    const held = new Set([
        ...composition.members.map(m => m.personId), ...composition.substituteMembers.map(m => m.personId),
        ...(composition.president ? [composition.president.personId] : []), ...(composition.mayor ? [composition.mayor.personId] : []),
    ]);
    const extra = [...attendance.present, ...attendance.absent].filter(m => !held.has(m.personId));
    return buildRollCall({ ...composition, members: [...composition.members, ...extra] }, absentIds, bodyType, presidedBy);
}

/** The office after an absent president's name in the minutes' lists: «ΠΡΟΕΔΡΟΣ», or «ΠΡΟΕΔΡΟΣ, ΔΗΜΑΡΧΟΣ». */
export function formatRollCallOffice(office: MinutesRollCallOffice): string {
    return office.isMayor ? 'ΠΡΟΕΔΡΟΣ, ΔΗΜΑΡΧΟΣ' : 'ΠΡΟΕΔΡΟΣ';
}

/**
 * The parenthesis after a member's name in the minutes' lists: «αναπλ. μέλος»
 * for a substitute, the office of an absent president, then the party, with
 * «Επικεφαλής» for its head.
 */
export function formatRollCallMemberLabel({ member, isSubstitute, office }: MinutesRollCallMember): string | null {
    const labels: string[] = [];
    if (isSubstitute) labels.push('αναπλ. μέλος');
    if (office) labels.push(formatRollCallOffice(office));
    if (member.party) labels.push(member.isPartyHead ? `${member.party}, Επικεφαλής` : member.party);
    return labels.length > 0 ? labels.join(', ') : null;
}

/** A name in a council's «απουσίαζαν οι» sentence: an absent president carries the office. */
export function formatRollCallSentenceName({ member, office }: MinutesRollCallMember): string {
    return office ? `${member.name} (${formatRollCallOffice(office)})` : member.name;
}

/** One of the mayor's own arrivals or departures, worded for the mayor's note. */
export type MayorChange = { type: 'arrival' | 'departure'; label: string };

/**
 * The parenthesis after the mayor's name — on the ΔΗΜΑΡΧΟΣ line, or on the
 * ΠΡΟΕΔΡΟΣ line of a committee the mayor presides: absent/present at the roll
 * call, and their own arrivals or departures. Who presided in an absent
 * president's place is on the ΠΡΟΕΔΡΟΣ line (`buildRollCall`), not here.
 */
export function buildMayorNote(
    rollCallStatus: 'PRESENT' | 'ABSENT' | null,
    mayorChanges: MayorChange[],
    feminine: boolean,
): string | null {
    const parts: string[] = [];
    if (rollCallStatus === 'ABSENT') parts.push(feminine ? 'ΑΠΟΥΣΑ' : 'ΑΠΩΝ');
    for (const c of mayorChanges) parts.push(`${c.type === 'arrival' ? 'προσήλθε' : 'αποχώρησε'} ${c.label}`);
    return parts.length ? parts.join(', ') : null;
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
        const anchorLabel = formatAnchorLabel(e);
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
 * who does not preside, or a presiding mayor whose line names who presided in
 * their absence (`presidentStandIn`): that mayor's line carries no note, and
 * their changes stay in the list, like any member's.
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

/**
 * The time at which each subject takes its place in the discussion order, for
 * `sortSubjectsByDiscussionOrder`: the start of the subject's discussion span
 * (`discussionSpans`) that holds its first VOTE utterance, else of its first
 * span. A subject discussed in one stretch is thus placed at its first utterance
 * that is not a procedural vote (at its procedural vote when it has nothing
 * else; an untagged utterance counts as discussion). A subject that was left
 * pending while another subject was voted, and resumed and voted later, is
 * placed where its discussion resumed — the council took it up again there.
 */
export function discussionOrderKeys(utterances: SpanUtterance[]): Map<string, number> {
    const keys = new Map<string, number>();
    for (const [id, spans] of discussionSpans(utterances)) {
        keys.set(id, (spans.find(s => s.hasVote) ?? spans[0]).start);
    }
    return keys;
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
 * A meeting's sections as the minutes print them: the record subjects in
 * discussion order (`orderedMinutesSubjects`), the temporal windows of the
 * subjects that are not withdrawn, and every utterance assigned to one bucket.
 * `getMinutesData` and the `decisions sections` script both call this, so the
 * script prints the sections that the minutes print.
 *
 * `subjects` can hold every subject of the meeting. `ordered` keeps the record
 * subjects, withdrawn ones included (the minutes list them in the table of
 * contents). `utterances` are all the meeting's utterances, sorted by start.
 */
export function minutesSections<T extends SortableSubject & { withdrawn: boolean }>(
    subjects: T[],
    utterances: WindowUtterance[],
): { ordered: T[]; windows: TemporalWindow[]; assignment: AssignmentResult } {
    const activeIds = subjects.filter(s => isRecordSubject(s) && !s.withdrawn).map(s => s.id);
    const windows = computeTemporalWindows(utterances, activeIds);
    const ordered = orderedMinutesSubjects(subjects, discussionOrderKeys(utterances));
    const assignment = assignUtterances(utterances, windows, ordered.filter(s => !s.withdrawn).map(s => s.id));
    return { ordered, windows, assignment };
}

interface OrderLineSubject {
    agendaItemIndex: number | null;
    nonAgendaReason: string | null;
}

/**
 * Each subject's place in the order line, for subjects in printed order:
 * «3ο» for an agenda item, «ΕΗΔ1», «ΕΗΔ2», … for the out-of-agenda subjects in
 * the order they were discussed. An agenda item with no index has an empty
 * label: it has no number to print.
 */
export function discussionOrderPositions(subjects: readonly OrderLineSubject[]): OrderPosition[] {
    let oaCounter = 0;
    return subjects.map((s, i) => {
        if (s.nonAgendaReason === 'outOfAgenda') {
            oaCounter++;
            return { label: `ΕΗΔ${oaCounter}`, sequence: 'outOfAgenda', index: oaCounter };
        }
        // An agenda item with no index has no place in the agenda's
        // counting, so it gets a sequence of its own and never joins a
        // run with the numbered items around it.
        return s.agendaItemIndex === null
            ? { label: '', sequence: `unnumbered-${i}`, index: i }
            : { label: `${s.agendaItemIndex}ο`, sequence: 'agenda', index: s.agendaItemIndex };
    });
}

/**
 * The «Σειρά συζήτησης» line of the minutes, for the non-withdrawn subjects in
 * printed order. Null when the order is the natural one: out-of-agenda subjects
 * first, then the agenda items by index.
 */
export function discussionOrderLabel(subjects: readonly OrderLineSubject[]): string | null {
    const naturalOrder = [...subjects].sort((a, b) => {
        const aIsOA = a.nonAgendaReason === 'outOfAgenda';
        const bIsOA = b.nonAgendaReason === 'outOfAgenda';
        if (aIsOA !== bIsOA) return aIsOA ? -1 : 1;
        return (a.agendaItemIndex ?? 0) - (b.agendaItemIndex ?? 0);
    });
    if (subjects.length === 0 || subjects.every((s, i) => s === naturalOrder[i])) return null;
    // A position with an empty label stays in the walk, so it still breaks a run, and prints nothing.
    return collapseOrderRuns(discussionOrderPositions(subjects)).filter(part => part !== '').join(', ');
}

/**
 * The subjects whose sections hold utterances tagged to `subjectId` (the
 * «Μέρος της συζήτησης πραγματοποιήθηκε κατά τη συζήτηση …» note), in the order
 * the assignment met them. Read from `AssignmentResult.crossSubjectMap`.
 */
export function discussedElsewhereIds(
    subjectId: string,
    crossSubjectMap: ReadonlyMap<string, ReadonlyMap<string, string>>,
): string[] {
    const owners: string[] = [];
    for (const [ownerSubjectId, crossMap] of crossSubjectMap) {
        if (ownerSubjectId === subjectId || owners.includes(ownerSubjectId)) continue;
        for (const linkedSubjectId of crossMap.values()) {
            if (linkedSubjectId === subjectId) {
                owners.push(ownerSubjectId);
                break;
            }
        }
    }
    return owners;
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
 * The label an anchor that is not an agenda item prints, or null for one that
 * prints the subject. A decision number reads «στην 286 ΑΚΣ»: the change takes
 * effect at that decision, as «από το 5ο θέμα» names the first subject on the
 * other side. With timing AFTER it takes effect at the next decision, so it
 * reads «μετά την 286 ΑΚΣ».
 */
export function formatAnchorLabel(e: Pick<PlaceableEvent, 'anchorKind' | 'anchorDecisionNumber' | 'anchorPhase' | 'timing'>): string | null {
    if (e.anchorKind === 'DECISION_NUMBER' && decisionOrdinal(e.anchorDecisionNumber) != null) {
        return `${e.timing === 'AFTER' ? 'μετά την' : 'στην'} ${e.anchorDecisionNumber} ΑΚΣ`;
    }
    if (e.anchorKind === 'PHASE') {
        return e.anchorPhase === 'OUT_OF_AGENDA' ? 'κατά τα θέματα εκτός ημερήσιας διάταξης' : 'πριν την ημερήσια διάταξη';
    }
    return null;
}

/**
 * Where a change happened, as a phrase that can follow a name or a verb:
 * «στην 286 ΑΚΣ» (`formatAnchorLabel`) when the document pinned it to something
 * other than an agenda item, «από το 5ο θέμα» otherwise — `atSubject` is the subject the member is
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
