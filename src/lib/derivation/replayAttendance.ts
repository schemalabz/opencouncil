import type { AttendanceStatus } from '@prisma/client';
import type { DecisionConventions } from '@/lib/decisionConventions';
import { placeEvents, type PlacedEvent } from './placeEvents';
import { sourceRank } from './types';
import type { DerivedAttendanceRow, DocumentFacts, EventRow, Issue, OrderedSubject, RollCallRow } from './types';

export interface ReplayInput {
    subjects: OrderedSubject[];
    rollCall: RollCallRow[];
    events: EventRow[];
    documents: DocumentFacts[];
    conventions: DecisionConventions | null;
    mayorPersonId: string | null;
    /** Who holds the body's chair on the meeting's date; a per-decision list does not judge them. */
    presidentPersonId?: string | null;
    /** The body's secretary, only where its conventions say the list leaves them out as well. */
    secretaryPersonId?: string | null;
}

export interface ReplayResult {
    attendance: DerivedAttendanceRow[];
    /** Present member ids per subject (mayor excluded); absent for subjects with no rows. */
    presentBySubject: Map<string, Set<string>>;
    issues: Issue[];
    unknownSubjectIds: string[];
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
        issues.push({ code: 'NO_ROLL_CALL', severity: 'error', source: null, params: {} });
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
            issues.push({ code: 'PRESENCE_UNKNOWN', severity: 'warning', subjectId: s.id, source: null, params: { reason: 'unsettled' } });
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

    // MeetingAttendance carries one row per person per source, so two sources can
    // disagree about one person; SOURCE_PRECEDENCE decides and the loser is reported.
    const state = new Map<string, AttendanceStatus>();
    const rollCallSource = new Map<string, RollCallRow>();
    for (const r of rollCall) {
        const prev = rollCallSource.get(r.personId);
        if (!prev) { rollCallSource.set(r.personId, r); state.set(r.personId, r.status); continue; }
        if (prev.status === r.status) continue;
        const [win, lose] = sourceRank(r.source) < sourceRank(prev.source) ? [r, prev] : [prev, r];
        issues.push({ code: 'SOURCES_DISAGREE', severity: 'warning', personId: r.personId, source: win.source,
            params: { kind: 'rollCall', winSource: win.source, winStatus: win.status, loseSource: lose.source, loseStatus: lose.status } });
        rollCallSource.set(r.personId, win);
        state.set(r.personId, win.status);
    }

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
     * against a departure is still two sources disagreeing.
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
            issues.push({ code: 'SOURCES_DISAGREE', severity: 'warning', subjectId, personId: e.personId, source: win.source, rawText: win.rawText,
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
        // statement made twice, and a member they disagree on is reported.
        const perDecisionRollCall = meaning === 'per_decision' && doc?.rollCallPresentIds ? new Set(doc.rollCallPresentIds) : null;
        if (perDecisionRollCall && doc) {
            for (const personId of [...doc.rollCallPresentIds ?? [], ...doc.rollCallAbsentIds ?? []]) {
                if (personId === mayorPersonId) continue;
                state.set(personId, perDecisionRollCall.has(personId) ? 'PRESENT' : 'ABSENT');
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
                // construction, so their absence from it states nothing about them.
                if (personId === mayorPersonId) continue;
                // Nor about whoever presides: the list is of the members, and the chair is
                // not written into it — the president in 185 of 192 documents across 13
                // bodies, and the vice-president instead on the 48 where Zografou ΔΕ says
                // he presided. Reading the omission as absence took them, and their vote,
                // out of every decision they chaired. Some bodies leave the secretary out
                // the same way (Chalandri and Papagos ΔΣ; Argos ΔΣ lists theirs), which is
                // a convention of the body. A list that does name them is still believed,
                // and a stated departure still takes them out.
                const actingSecretary = input.secretaryPersonId !== null && input.secretaryPersonId !== undefined ? doc.actingSecretaryId : null;
                const notWrittenIn = personId === input.presidentPersonId || personId === doc.presidedById || personId === input.secretaryPersonId || personId === actingSecretary;
                if (notWrittenIn && !statedPresent.has(personId)) continue;
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
                    // (ΑΠΟΧΩΡΗΣΑΝΤΕΣ as the list) shows up, and stays a warning.
                    if (perDecisionRollCall) issues.push({ code: 'SOURCES_DISAGREE', severity: status === 'ABSENT' ? 'info' : 'warning', subjectId: s.id, personId, decisionId: doc.decisionId, source: 'decision',
                        params: { kind: 'rollCallVsList', rollCallStatus: before, listStatus: status } });
                    else if (contradicted) issues.push({ code: 'SOURCES_DISAGREE', severity: 'warning', subjectId: s.id, personId, decisionId: doc.decisionId,
                        source: 'decision', rawText: contradicted.rawText,
                        params: { kind: 'statedList', status, eventKind: contradicted.kind, rawText: contradicted.rawText } });
                    else issues.push({ code: 'IMPLIED_CHANGE', severity: 'info', subjectId: s.id, personId, decisionId: doc.decisionId, source: 'decision',
                        params: { status } });
                }
                state.set(personId, status);
            }
            emit(s.id, 'stated');
        } else if (meaning !== 'unknown' || assumeOpening) {
            emit(s.id, 'derived');
            if (assumeOpening && statesAnArrival) {
                issues.push({ code: 'PRESENCE_UNKNOWN', severity: 'warning', subjectId: s.id, source: null, params: { reason: 'assumedOpening' } });
            }
        } else {
            unknownSubjectIds.push(s.id);
            issues.push({ code: 'PRESENCE_UNKNOWN', severity: 'warning', subjectId: s.id, source: null, params: { reason: 'noPerDecisionList' } });
        }
    });
    return { attendance, presentBySubject, issues, unknownSubjectIds };
}
