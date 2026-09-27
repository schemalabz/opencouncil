/**
 * The wire vocabulary of a stated change's anchor, mapped to the stored enums,
 * and what one page states about arrivals, departures and per-vote absences,
 * read from its stored reading. Its own module (and not part of the "use
 * server" poll handler) so the mapping can be read and tested without the
 * callback around it.
 */
import { AttendanceAnchorKind, AttendanceEventKind, AttendancePhase, AttendanceTiming, NonAgendaReason } from "@prisma/client";
import type { PollDecisionsAttendanceEvent } from "@/lib/apiTypes";
import { decisionOrdinal } from "./placeEvents";
import type { DocumentFacts, PerVoteAbsence, StatedChange } from "./types";

export const ANCHOR_KIND: Record<string, AttendanceAnchorKind> = {
    agenda_item: AttendanceAnchorKind.AGENDA_ITEM, decision_number: AttendanceAnchorKind.DECISION_NUMBER,
    subject: AttendanceAnchorKind.SUBJECT, phase: AttendanceAnchorKind.PHASE,
    session_start: AttendanceAnchorKind.SESSION_START, session_end: AttendanceAnchorKind.SESSION_END,
    // task version 3 vocabulary
    this_document: AttendanceAnchorKind.SUBJECT, session_phase: AttendanceAnchorKind.PHASE,
};
export const ANCHOR_PHASE: Record<string, AttendancePhase> = { pre_agenda: AttendancePhase.PRE_AGENDA, out_of_agenda: AttendancePhase.OUT_OF_AGENDA };
export const ANCHOR_TIMING: Record<string, AttendanceTiming> = { before: AttendanceTiming.BEFORE, during: AttendanceTiming.DURING, after: AttendanceTiming.AFTER };

/**
 * The stored anchor kind for one event, or null when the vocabulary is one we do
 * not know — the column is a NOT NULL enum, so an undefined here used to throw
 * inside createMany and roll the whole meeting's events back to the previous set.
 *
 * A v3 «clock_time» («αποχώρησε στις 20:15») names no subject, and the design
 * drops the anchor. Read as the boundary it is closest to — an arrival at the
 * start, a departure at the end — it states presence throughout rather than
 * inventing an absence from subject 0 onwards, which SESSION_START did for both.
 */
export function anchorKindOf(e: Pick<PollDecisionsAttendanceEvent, 'type' | 'anchor'>): AttendanceAnchorKind | null {
    if (e.anchor.kind === 'clock_time') {
        return e.type === 'arrival' ? AttendanceAnchorKind.SESSION_START : AttendanceAnchorKind.SESSION_END;
    }
    return ANCHOR_KIND[e.anchor.kind] ?? null;
}

/**
 * One change a page states, from its stored wire entry, or null when the entry
 * names no person or an anchor kind we do not know. The poll handler dropped such
 * an event at store time; the derivation drops it at read time the same way.
 */
export function statedChangeOf(entry: unknown): StatedChange | null {
    if (entry === null || typeof entry !== 'object') return null;
    const e = entry as Partial<PollDecisionsAttendanceEvent>;
    if (typeof e.personId !== 'string' || (e.type !== 'arrival' && e.type !== 'departure')) return null;
    if (!e.anchor || typeof e.anchor !== 'object') return null;
    const anchorKind = anchorKindOf({ type: e.type, anchor: e.anchor });
    if (!anchorKind) return null;
    const a = e.anchor;
    return {
        personId: e.personId,
        kind: e.type === 'arrival' ? AttendanceEventKind.ARRIVAL : AttendanceEventKind.DEPARTURE,
        anchorKind,
        anchorAgendaItemIndex: typeof a.agendaItemIndex === 'number' ? a.agendaItemIndex : null,
        anchorNonAgendaReason: a.nonAgendaReason === 'outOfAgenda' ? NonAgendaReason.outOfAgenda : null,
        anchorDecisionNumber: typeof a.decisionNumber === 'string' ? a.decisionNumber : null,
        anchorSubjectId: typeof a.subjectId === 'string' ? a.subjectId : null,
        anchorPhase: a.phase ? ANCHOR_PHASE[a.phase] ?? null : null,
        timing: a.timing ? ANCHOR_TIMING[a.timing] ?? null : null,
        rawText: typeof e.rawText === 'string' ? e.rawText : '',
    };
}

/**
 * One per-vote absence from its stored wire entry (`absent_for_vote`), or null
 * when the entry is not one or names no person. An anchor of kind
 * `decision_number` names a range, and a single number is a range of one. Every
 * other anchor is this page's own decision, as the task read every per-vote
 * absence before the reader could name a range.
 */
export function perVoteAbsenceOf(entry: unknown): PerVoteAbsence | null {
    if (entry === null || typeof entry !== 'object') return null;
    const e = entry as Partial<PollDecisionsAttendanceEvent>;
    if (e.type !== 'absent_for_vote' || typeof e.personId !== 'string') return null;
    const a = e.anchor && typeof e.anchor === 'object' ? e.anchor : null;
    const from = a?.kind === 'decision_number' && typeof a.decisionNumber === 'string' ? a.decisionNumber : null;
    const to = from !== null && typeof a?.decisionNumberTo === 'string' ? a.decisionNumberTo : from;
    return { personId: e.personId, decisionNumberFrom: from, decisionNumberTo: to, rawText: typeof e.rawText === 'string' ? e.rawText : '' };
}

/**
 * A reading stored before `absent_for_vote` reached the wire: the task expanded
 * each per-vote absence into a departure before and an arrival after the page's
 * own subject, both with the sentence's rawText.
 */
const isExpandedPair = (out: StatedChange, back: StatedChange) =>
    out.kind === 'DEPARTURE' && out.anchorKind === 'SUBJECT' && out.timing === 'BEFORE'
    && back.kind === 'ARRIVAL' && back.anchorKind === 'SUBJECT' && back.timing === 'AFTER'
    && back.personId === out.personId && back.anchorSubjectId === out.anchorSubjectId && back.rawText === out.rawText;

/**
 * What one page states about who came and went, from its stored
 * `attendanceChanges`. The one definition of a per-vote absence: an
 * `absent_for_vote` entry, or the expanded pair of an older reading, which gives
 * the same record. Everything else is a stated change. Entries with no person
 * or an anchor kind we do not know are dropped, as the poll handler dropped
 * them at store time.
 */
export function pageStatementsOf(entries: unknown): Pick<DocumentFacts, 'statedChanges' | 'perVoteAbsences'> {
    const items = (Array.isArray(entries) ? entries : [])
        .map(entry => perVoteAbsenceOf(entry) ?? statedChangeOf(entry))
        .filter((x): x is PerVoteAbsence | StatedChange => x !== null);
    const paired = new Set<StatedChange>();
    const read = items.flatMap((item): Array<PerVoteAbsence | StatedChange> => {
        if (!('kind' in item)) return [item];
        if (paired.has(item)) return [];
        const back = items.find((c): c is StatedChange => 'kind' in c && !paired.has(c) && isExpandedPair(item, c));
        if (!back) return [item];
        paired.add(item).add(back);
        return [{ personId: item.personId, decisionNumberFrom: null, decisionNumberTo: null, rawText: item.rawText }];
    });
    return {
        statedChanges: read.filter((x): x is StatedChange => 'kind' in x),
        perVoteAbsences: read.filter((x): x is PerVoteAbsence => !('kind' in x)),
    };
}

/** Whether a per-vote absence names a range that includes the decision numbered `decisionNumber`. False for an absence from the page's own decision. */
export function rangeCoversDecision(a: PerVoteAbsence, decisionNumber: string | null | undefined): boolean {
    const n = decisionOrdinal(decisionNumber), from = decisionOrdinal(a.decisionNumberFrom), to = decisionOrdinal(a.decisionNumberTo);
    if (n === null || from === null || to === null) return false;
    return n >= Math.min(from, to) && n <= Math.max(from, to);
}

/**
 * The members a page states were out of the room for its own decision: a
 * per-vote absence from this decision or from a range that includes it, and a
 * departure pinned to this page's subject that does not come after the decision
 * («κατά την λήψη της παρούσας απόφασης είχαν αποχωρήσει», with no return).
 * `decisionNumber` is the page's own.
 */
export function outForOwnVote(page: Pick<DocumentFacts, 'statedChanges' | 'perVoteAbsences'>, decisionNumber: string | null | undefined): Set<string> {
    return new Set([
        ...page.perVoteAbsences.filter(a => a.decisionNumberFrom === null || rangeCoversDecision(a, decisionNumber)).map(a => a.personId),
        ...page.statedChanges.filter(c => c.kind === 'DEPARTURE' && c.anchorKind === 'SUBJECT' && c.timing !== 'AFTER').map(c => c.personId),
    ]);
}
