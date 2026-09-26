import type { AttendanceStatus } from '@prisma/client';
import type { DecisionConventions } from '@/lib/decisionConventions';
import { outForOwnVote, rangeCoversDecision } from './anchors';
import { placeEvents, type PlacedEvent } from './placeEvents';
import { sourceRank } from './types';
import type { DerivedAttendanceRow, DocumentFacts, EventRow, Issue, IssueParams, OrderedSubject, RollCallRow } from './types';

export interface ReplayInput {
    subjects: OrderedSubject[];
    rollCall: RollCallRow[];
    events: EventRow[];
    documents: DocumentFacts[];
    conventions: DecisionConventions | null;
    mayorPersonId: string | null;
    /** The city's mayor on the meeting date, whatever the body; on a body the mayor sits on (mayorPersonId null) a page that states the mayor apart (`mayorStatedSeparately`) does not judge them by its member list either. */
    cityMayorPersonId?: string | null;
    /** Who holds the body's chair on the meeting's date; a per-decision list does not judge them. */
    presidentPersonId?: string | null;
    /** The body's secretary, only where its conventions say the list leaves them out as well. */
    secretaryPersonId?: string | null;
    /** Why the pages resolved no roll call (resolveSession); `NO_ROLL_CALL` carries it. */
    rollCallMissing?: IssueParams['NO_ROLL_CALL']['reason'] | null;
}

export interface ReplayResult {
    attendance: DerivedAttendanceRow[];
    /** Present member ids per subject (mayor excluded); absent for subjects with no rows. */
    presentBySubject: Map<string, Set<string>>;
    issues: Issue[];
    unknownSubjectIds: string[];
}

/**
 * One roll-call row per person. MeetingAttendance carries one row per person per
 * source, so two sources can disagree about one person; SOURCE_PRECEDENCE decides
 * and the loser is reported. A person keeps the position of their first row.
 */
export function rankRollCall(rollCall: RollCallRow[]): { rows: Map<string, RollCallRow>; issues: Issue[] } {
    const rows = new Map<string, RollCallRow>();
    const issues: Issue[] = [];
    for (const r of rollCall) {
        const prev = rows.get(r.personId);
        if (!prev) { rows.set(r.personId, r); continue; }
        if (prev.status === r.status) continue;
        const [win, lose] = sourceRank(r.source) < sourceRank(prev.source) ? [r, prev] : [prev, r];
        issues.push({ code: 'SOURCES_DISAGREE', personId: r.personId, source: win.source,
            params: { kind: 'rollCall', winSource: win.source, winStatus: win.status, loseSource: lose.source, loseStatus: lose.status } });
        rows.set(r.personId, win);
    }
    return { rows, issues };
}

/**
 * Whether a per-decision member list's (ΤΑ ΜΕΛΗ) silence about `personId` states
 * nothing about them, so their absence from it must not be read as absence: the
 * body's own mayor, always (§3, the list omits them by construction, and their
 * being named is not judged either); otherwise whoever presides or chairs this
 * decision, the secretary or their stand-in where the body's rule leaves the list
 * without them, and the city's mayor where the body states them in a sentence of
 * their own — but only where the list does not itself name them, since a body
 * that does name one of these people is still believed. The replay and the
 * verification sheet both call this: the one place the exemption is written.
 */
export function notWrittenInList(
    personId: string,
    presentInList: boolean,
    input: Pick<ReplayInput, 'mayorPersonId' | 'presidentPersonId' | 'secretaryPersonId' | 'conventions' | 'cityMayorPersonId'>,
    doc: Pick<DocumentFacts, 'presidedById' | 'actingSecretaryId'>,
): boolean {
    if (personId === input.mayorPersonId) return true;
    const actingSecretary = input.secretaryPersonId !== null && input.secretaryPersonId !== undefined ? doc.actingSecretaryId : null;
    const mayorWrittenApart = input.conventions?.mayorStatedSeparately === true && personId === input.cityMayorPersonId;
    const exempt = personId === input.presidentPersonId || personId === doc.presidedById || personId === input.secretaryPersonId
        || personId === actingSecretary || mayorWrittenApart;
    return exempt && !presentInList;
}

/**
 * Roll call + placed events → who was present for each subject, along the
 * transcript order. A document's own present list (bodies that print one) wins for
 * its subject and resets the state from there; what it changed without a stated
 * event is an IMPLIED_CHANGE issue. Unknown present-list meaning → no rows.
 */
/** See replayAttendance: replay an unsettled present list as an opening roll call, with an issue per subject. */
export const ASSUME_OPENING_WHEN_UNKNOWN = true;

export function replayAttendance(input: ReplayInput): ReplayResult {
    const { subjects, rollCall, conventions, mayorPersonId } = input;
    const issues: Issue[] = [];
    const attendance: DerivedAttendanceRow[] = [];
    const presentBySubject = new Map<string, Set<string>>();
    const unknownSubjectIds: string[] = [];

    if (rollCall.length === 0) {
        issues.push({ code: 'NO_ROLL_CALL', source: null, params: { reason: input.rollCallMissing ?? 'noRollCall' } });
        return { attendance, presentBySubject, issues, unknownSubjectIds };
    }
    const meaning = conventions?.presentListMeaning ?? 'unknown';
    const statesPerDecision = conventions?.statesPerDecisionAttendance === true;
    // An unsettled present-list meaning is replayed as an opening roll call (what
    // every body measured so far turned out to be) and every subject carries a
    // PRESENCE_UNKNOWN issue until the body's conventions are confirmed. Flip to
    // false to print nothing for such bodies instead (spec §6 rule 3, strict form).
    const assumeOpening = ASSUME_OPENING_WHEN_UNKNOWN && meaning === 'unknown';
    if (meaning === 'unknown' && !statesPerDecision && !assumeOpening) {
        for (const s of subjects) {
            unknownSubjectIds.push(s.id);
            issues.push({ code: 'PRESENCE_UNKNOWN', subjectId: s.id, source: null, params: { reason: 'unsettled' } });
        }
        return { attendance, presentBySubject, issues, unknownSubjectIds };
    }

    const { placed, issues: placeIssues } = placeEvents(subjects, input.events);
    /**
     * `opening` and `cumulative` part company in exactly one place: seeding the
     * people who have an ARRIVAL (below). A meeting that states no arrival derives
     * identically under either, so an unsettled body is not a doubt about these
     * rows, and saying so on every subject buries the issues that are.
     *
     * Measured 2026-09-19 over 358 stored readings: eight bodies state no arrival
     * at all — not as a stated change, not as a per-decision list that grows, not
     * as a line after ΑΠΟΦΑΣΙΖΕΙ — and they raised 86 of 208 issues between them.
     * The condition is per meeting, so the doubt returns the moment one does.
     */
    const statesAnArrival = placed.some(p => p.event.kind === 'ARRIVAL');
    issues.push(...placeIssues);
    const byIndex = new Map<number, EventRow[]>();
    for (const p of placed) byIndex.set(p.effectAt, [...(byIndex.get(p.effectAt) ?? []), p.event]);
    const docBySubject = new Map(input.documents.map(d => [d.subjectId, d]));
    /**
     * Per subject, the members a range of decisions on any page puts out of the
     * room for that subject's decision, with the sentence. The run's departure is
     * at its first subject, so a later subject of the range has no event of its own.
     */
    const outByRange = new Map<string, Map<string, string>>();
    for (const d of input.documents) {
        for (const a of d.perVoteAbsences) {
            if (a.decisionNumberFrom === null) continue;
            for (const s of subjects) {
                if (!rangeCoversDecision(a, s.decisionNumber)) continue;
                const out = outByRange.get(s.id) ?? new Map<string, string>();
                outByRange.set(s.id, out);
                if (!out.has(a.personId)) out.set(a.personId, a.rawText);
            }
        }
    }

    const ranked = rankRollCall(rollCall);
    issues.push(...ranked.issues);
    const state = new Map<string, AttendanceStatus>([...ranked.rows].map(([personId, r]) => [personId, r.status]));

    // Someone the roll call never named still needs a row for every subject: their
    // first placed event says which side of it they were on before it fired.
    const firstEvent = new Map<string, PlacedEvent>();
    for (const p of placed) {
        const prev = firstEvent.get(p.event.personId);
        if (!prev || p.effectAt < prev.effectAt) firstEvent.set(p.event.personId, p);
    }
    for (const [personId, p] of firstEvent) {
        if (state.has(personId)) continue;
        state.set(personId, p.event.kind === 'ARRIVAL' ? 'ABSENT' : 'PRESENT');
    }

    // A cumulative present list already contains the late arrivals, so a roll-call
    // PRESENT for someone who also has an ARRIVAL means "present by the end", not
    // "present from subject 0"; their arrival event is what puts them in the room.
    if (meaning === 'cumulative') for (const p of placed) if (p.event.kind === 'ARRIVAL') state.set(p.event.personId, 'ABSENT');

    const emit = (subjectId: string, origin: DerivedAttendanceRow['origin']) => {
        const present = new Set<string>();
        for (const [personId, status] of state) {
            if (personId === mayorPersonId) continue;
            attendance.push({ subjectId, personId, status, origin });
            if (status === 'PRESENT') present.add(personId);
        }
        presentBySubject.set(subjectId, present);
    };

    /**
     * A per-vote absence is a pair on the document's own subject: out before it,
     * back after it. «Back after N» takes effect where «out before N+1» does, so a
     * member out for two decisions running has an arrival and a departure at one
     * point. Those are two documents each describing their own vote, in time order,
     * and the later one stands. Only this shape: a return stated any other way
     * against a departure is still two sources disagreeing. The resolver combines
     * the pages' per-vote absences into one departure and one arrival per run
     * (resolveSession.ts), so this settles the pair shape only when it reaches the
     * replay some other way.
     */
    const outAgainForTheNextVote = (a: EventRow, b: EventRow, i: number, subjectId: string): EventRow | null => {
        const [back, out] = a.kind === 'ARRIVAL' ? [a, b] : [b, a];
        const ownVote = (e: EventRow, timing: EventRow['timing'], anchor: string | undefined) =>
            e.anchorKind === 'SUBJECT' && e.timing === timing && anchor !== undefined && e.anchorSubjectId === anchor;
        return ownVote(back, 'AFTER', subjects[i - 1]?.id) && ownVote(out, 'BEFORE', subjectId) ? out : null;
    };

    /** The events at one index, one per person: an arrival and a departure at the same point contradict each other. */
    const settleEventsAt = (i: number, subjectId: string): EventRow[] => {
        const chosen = new Map<string, EventRow>();
        for (const e of byIndex.get(i) ?? []) {
            const prev = chosen.get(e.personId);
            if (!prev) { chosen.set(e.personId, e); continue; }
            if (prev.kind === e.kind) continue;  // the same change stated twice
            const stillOut = outAgainForTheNextVote(prev, e, i, subjectId);
            if (stillOut) { chosen.set(e.personId, stillOut); continue; }
            const [win, lose] = sourceRank(e.source) < sourceRank(prev.source) ? [e, prev] : [prev, e];
            issues.push({ code: 'SOURCES_DISAGREE', subjectId, personId: e.personId, source: win.source, rawText: win.rawText,
                params: { kind: 'event', winKind: win.kind, winRawText: win.rawText, winSource: win.source, loseRawText: lose.rawText, loseSource: lose.source } });
            chosen.set(e.personId, win);
        }
        return [...chosen.values()];
    };

    subjects.forEach((s, i) => {
        const eventsHere = settleEventsAt(i, s.id);
        for (const e of eventsHere) state.set(e.personId, e.kind === 'ARRIVAL' ? 'PRESENT' : 'ABSENT');
        const doc = docBySubject.get(s.id);
        // A per-decision roll call is this document's own statement of who was in
        // the room for its item — Argos ΔΣ prints Μπουλούκος under ΑΠΟΝΤΕΣ on items
        // 1–2 and under ΠΑΡΟΝΤΕΣ from item 3, where he «προσήλθε». The page states
        // the state; nothing is implied, and a subject with no document keeps the
        // last one read. Where the page also prints ΤΑ ΜΕΛΗ the two are one
        // statement made twice, and a member they disagree on is reported. A
        // member the page names under both headings is absent (spec §4.1.12).
        const pageAbsent = new Set(doc?.rollCallAbsentIds ?? []);
        const perDecisionRollCall = meaning === 'per_decision' && doc?.rollCallPresentIds
            ? new Set(doc.rollCallPresentIds.filter(personId => !pageAbsent.has(personId))) : null;
        const namedByPageRollCall = perDecisionRollCall ? new Set([...perDecisionRollCall, ...pageAbsent]) : null;
        if (perDecisionRollCall && doc) {
            const eventHere = new Map(eventsHere.map(e => [e.personId, e]));
            // The page's own word that a member was out for this decision outranks its
            // roll call, as a departure pinned here does below. A run of per-vote
            // absences has one departure, before its first subject, so the later
            // subjects of the run have no event of their own to say it.
            const outForThisVote = outForOwnVote(doc, s.decisionNumber);
            for (const personId of new Set([...doc.rollCallPresentIds ?? [], ...doc.rollCallAbsentIds ?? []])) {
                if (personId === mayorPersonId) continue;
                if (outForThisVote.has(personId)) { state.set(personId, 'ABSENT'); continue; }
                const status: AttendanceStatus = perDecisionRollCall.has(personId) ? 'PRESENT' : 'ABSENT';
                const contradicted = eventHere.get(personId);
                const rangeSentence = outByRange.get(s.id)?.get(personId);
                if (!contradicted && status === 'PRESENT' && rangeSentence !== undefined) {
                    // A range on another page puts the member out for this decision, and
                    // this page lists them present without stating the absence: the page's
                    // roll call is the state, and the disagreement is reported.
                    issues.push({ code: 'SOURCES_DISAGREE', subjectId: s.id, personId, decisionId: doc.decisionId, source: 'decision',
                        rawText: rangeSentence, params: { kind: 'statedList', status, eventKind: 'DEPARTURE', rawText: rangeSentence } });
                }
                if (contradicted && (contradicted.kind === 'ARRIVAL') !== (status === 'PRESENT')) {
                    // A departure the page states for this very item («κατά την λήψη της
                    // παρούσας απόφασης είχαν αποχωρήσει») is its more specific word on that
                    // person and outranks its roll call, as it outranks the members list. Any
                    // other change it contradicts is the page against itself: the roll call
                    // is the state and wins, and the change is reported, not overwritten.
                    if (contradicted.kind === 'DEPARTURE' && contradicted.anchorKind === 'SUBJECT' && contradicted.anchorSubjectId === s.id) continue;
                    issues.push({ code: 'SOURCES_DISAGREE', subjectId: s.id, personId, decisionId: doc.decisionId, source: 'decision',
                        rawText: contradicted.rawText, params: { kind: 'statedList', status, eventKind: contradicted.kind, rawText: contradicted.rawText } });
                }
                state.set(personId, status);
            }
        }
        if (statesPerDecision && doc?.presentIds?.length) {
            // Spec §6.1: the document's own list *is* the attendance from here on.
            // A present-only list therefore makes everyone it omits absent, which is
            // how a body that never prints an absent list reports a departure.
            const statedPresent = new Set(doc.presentIds);
            const stated = new Map<string, AttendanceStatus>();
            for (const personId of [...state.keys(), ...doc.presentIds, ...(doc.absentIds ?? [])]) {
                // §3: a per-decision member list is ΤΑ ΜΕΛΗ — it omits the mayor by
                // construction, so their absence from it states nothing about them. Nor
                // does it about whoever presides, the secretary or their stand-in where
                // the body's rule leaves the list without them, or, where the body states
                // the mayor in a sentence of its own (`mayorStatedSeparately`), the city's
                // mayor: their state then comes from the roll call and their own stated
                // changes, the same as a member the list does not judge.
                if (notWrittenInList(personId, statedPresent.has(personId), input, doc)) continue;
                stated.set(personId, statedPresent.has(personId) ? 'PRESENT' : 'ABSENT');
            }
            const eventHere = new Map(eventsHere.map(e => [e.personId, e]));
            for (const [personId, status] of stated) {
                const before = state.get(personId);
                const contradicted = eventHere.get(personId);
                if (before !== undefined && before !== status) {
                    // The list is the clerk's last word on who decided and outlives every
                    // phrasing of a departure (Argos: «αποβλήθηκε… από την συνέχεια της
                    // συνεδρίασης», which no roll call moved for). A member the roll call has
                    // and the list drops is the list knowing more, and only worth a note; a
                    // member the list adds that no roll call has is how a misread column
                    // (ΑΠΟΧΩΡΗΣΑΝΤΕΣ as the list) shows up, and stays a warning. Two codes
                    // rather than one, because the two carry different severities and
                    // severity follows the code; there are two statuses and the sides
                    // disagree, so the code alone says which way round the pair is.
                    // Only for a member the page's roll call names: for anyone else
                    // `before` is the state carried from earlier pages, and quoting it
                    // as this page's roll call would state what the page never said.
                    if (namedByPageRollCall?.has(personId)) issues.push(status === 'ABSENT'
                        ? { code: 'LIST_DROPS_PRESENT', subjectId: s.id, personId, decisionId: doc.decisionId, source: 'decision', params: {} }
                        : { code: 'LIST_ADDS_ABSENT', subjectId: s.id, personId, decisionId: doc.decisionId, source: 'decision', params: {} });
                    else if (contradicted) issues.push({ code: 'SOURCES_DISAGREE', subjectId: s.id, personId, decisionId: doc.decisionId,
                        source: 'decision', rawText: contradicted.rawText,
                        params: { kind: 'statedList', status, eventKind: contradicted.kind, rawText: contradicted.rawText } });
                    else issues.push({ code: 'IMPLIED_CHANGE', subjectId: s.id, personId, decisionId: doc.decisionId, source: 'decision',
                        params: { status } });
                }
                state.set(personId, status);
            }
            emit(s.id, 'stated');
        } else if (meaning !== 'unknown' || assumeOpening) {
            emit(s.id, 'derived');
            if (assumeOpening && statesAnArrival) {
                issues.push({ code: 'PRESENCE_UNKNOWN', subjectId: s.id, source: null, params: { reason: 'assumedOpening' } });
            }
        } else {
            unknownSubjectIds.push(s.id);
            issues.push({ code: 'PRESENCE_UNKNOWN', subjectId: s.id, source: null, params: { reason: 'noPerDecisionList' } });
        }
    });
    return { attendance, presentBySubject, issues, unknownSubjectIds };
}
