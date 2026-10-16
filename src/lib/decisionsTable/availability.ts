import type { PresentationKey } from '@/lib/meetingPresentation';
import { takesNoDecisions } from '@/lib/tasks/pollDecisionsBackoff';
import { isRecordSubject } from '@/lib/utils/subjects';

/** The chips of a meeting that has not been held, or will not be. No table exists for them. */
const NOT_HELD: ReadonlyArray<PresentationKey> = ['upcoming', 'live', 'postponed', 'cancelled'];

/**
 * Whether the meeting page offers its Πίνακας αποφάσεων: the meeting has taken
 * place, it is a kind that takes decisions, and at least one subject is a row.
 * A meeting held by circulation has no recording and still decides, so the
 * `noRecording` chip offers the table.
 */
export function decisionsTableAvailable(
    stage: PresentationKey,
    meeting: Parameters<typeof takesNoDecisions>[0],
    subjects: ReadonlyArray<{ agendaItemIndex: number | null; nonAgendaReason: string | null }>,
): boolean {
    if (NOT_HELD.includes(stage)) return false;
    if (takesNoDecisions(meeting)) return false;
    return subjects.some(isRecordSubject);
}
