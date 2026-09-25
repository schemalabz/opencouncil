/**
 * The wire vocabulary of a stated change's anchor, mapped to the stored enums,
 * and one page's stated change read from its stored reading. Its own module
 * (and not part of the "use server" poll handler) so the mapping can be read
 * and tested without the callback around it.
 */
import { AttendanceAnchorKind, AttendanceEventKind, AttendancePhase, AttendanceTiming, NonAgendaReason } from "@prisma/client";
import type { PollDecisionsAttendanceEvent } from "@/lib/apiTypes";
import type { StatedChange } from "./types";

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
