/**
 * The wire vocabulary of a stated change's anchor, mapped to the stored enums,
 * and one page's stated change read from its stored reading. Its own module
 * (and not part of the "use server" poll handler) so the mapping can be read
 * and tested without the callback around it.
 */
import { AttendanceAnchorKind, AttendancePhase, AttendanceTiming } from "@prisma/client";
import type { PollDecisionsAttendanceEvent } from "@/lib/apiTypes";

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
export function anchorKindOf(e: PollDecisionsAttendanceEvent): AttendanceAnchorKind | null {
    if (e.anchor.kind === 'clock_time') {
        return e.type === 'arrival' ? AttendanceAnchorKind.SESSION_START : AttendanceAnchorKind.SESSION_END;
    }
    return ANCHOR_KIND[e.anchor.kind] ?? null;
}
