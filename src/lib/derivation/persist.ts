import { replaceDerivedRows } from '@/lib/db/derivationFacts';
import { deriveMeetingFacts } from './deriveMeetingFacts';
import { loadDerivationInput } from './load';
import type { DerivationInput, DerivationOutput, Issue } from './types';

/** Replace the meeting's derived rows (source = decision) with the output. */
export async function applyDerivation(input: DerivationInput, output: DerivationOutput, taskId: string | null = null): Promise<void> {
    await replaceDerivedRows(
        input.subjects.map(s => s.id),
        output.attendance.map(a => ({ subjectId: a.subjectId, personId: a.personId, status: a.status })),
        output.votes.map(v => ({ subjectId: v.subjectId, personId: v.personId, voteType: v.voteType })),
        taskId,
    );
}

/**
 * Why this meeting must not be written, or null when it may be.
 *
 * The write replaces every decision-sourced row of the meeting at once, so a
 * run over an incomplete input does not degrade the rows, it empties them. Two
 * inputs cannot produce the meeting's rows:
 *
 * - **A document without stored facts whose subject holds rows.** A meeting
 *   whose documents were read before facts were stored gains a newly published,
 *   extracted document on an ordinary incremental poll, and deriving then would
 *   rebuild that one subject and blank the older ones: their votes came from a
 *   reading that was never kept, so nothing can write them again. A re-poll
 *   fills the rest; until it does, the stored rows stand. A document that was
 *   never read and left no rows has nothing to lose: the meeting derives from
 *   the others and the unread one is an issue on its own subject
 *   (`UNREAD_DOCUMENT`). A meeting with no facts at all is never written.
 * - **No roll call.** Presence is a replay of the roll call, so an empty one
 *   derives nobody present anywhere — again not a correction of the stored rows
 *   but their deletion.
 */
export function derivationSkipIssue(input: DerivationInput): Issue | null {
    const unread = input.documents.filter(d => !d.hasExtraction);
    const holdsRows = new Set(input.subjectIdsWithStoredRows);
    if (unread.length > 0 && (unread.length === input.documents.length || unread.some(d => holdsRows.has(d.subjectId)))) {
        return {
            code: 'NO_STORED_FACTS', severity: 'error', source: null,
            params: { missing: unread.length, total: input.documents.length },
        };
    }
    if (input.rollCall.length === 0) {
        return {
            code: 'NO_ROLL_CALL', severity: 'error', source: null, params: {},
        };
    }
    return null;
}

/** Whether the input is one the derivation must not write; `derivationSkipIssue` says why. */
export function hasNothingToDeriveFrom(input: DerivationInput): boolean {
    return derivationSkipIssue(input) !== null;
}

export async function deriveAndPersist(cityId: string, meetingId: string, taskId: string | null = null): Promise<DerivationOutput> {
    const input = await loadDerivationInput(cityId, meetingId);
    const skip = derivationSkipIssue(input);
    if (skip) return { attendance: [], votes: [], phraseOnlySubjectIds: [], issues: [skip] };
    const output = deriveMeetingFacts(input);
    await applyDerivation(input, output, taskId);
    return output;
}

/** Read-only: what the derivation would produce now (issues and origins for the page). */
export async function explainMeeting(cityId: string, meetingId: string): Promise<DerivationOutput> {
    const input = await loadDerivationInput(cityId, meetingId);
    // The page describes the rows a write would leave, so a refusal is reported
    // as itself rather than as rows nothing stored.
    const skip = derivationSkipIssue(input);
    if (skip) return { attendance: [], votes: [], phraseOnlySubjectIds: [], issues: [skip] };
    return deriveMeetingFacts(input);
}
