// The sends nobody asks for (#874): the cron, the end of a decision poll, the
// end of a summarize and the review completion send what is ready. Callers
// authorize where there is a user; the cron and the task callbacks have none.
import "server-only";
import type { DocumentKind } from '@prisma/client';
import {
    CANDIDATE_PAGE_SIZE,
    failStaleDocumentSends,
    findDocumentSendCandidates,
    getReadinessFacts,
} from '@/lib/db/documentSends';
import type { CandidateCursor } from '@/lib/db/types';
import { errorMessage } from '@/lib/utils/errors';
import { AUTOMATIC_DOCUMENTS, evaluateReadiness, isSendable, readinessInputFor, type Readiness } from './readiness';
import { recipientsFor } from './settings';
import { attemptsExhausted, skipsAutomaticSend } from './status';
import { sendDocument, type SendDocumentResult } from './send';

export interface AutomaticSendOutcome {
    document: DocumentKind;
    readiness: Readiness | null;
    result: SendDocumentResult;
}

/**
 * Send every automatic document of one meeting that is ready. The task
 * callbacks and the review completion call this through after(), so a person
 * waits for none of it; the cron calls the sender for each candidate. Never
 * throws: the unique index stops a double send, and a failure is in the row.
 */
export async function sendReadyDocuments(cityId: string, meetingId: string): Promise<AutomaticSendOutcome[]> {
    const outcomes: AutomaticSendOutcome[] = [];
    for (const document of AUTOMATIC_DOCUMENTS) {
        const result = await sendDocument(cityId, meetingId, document, { by: 'automatic' });
        outcomes.push({ document, readiness: result.readiness ?? null, result });
    }
    return outcomes;
}

/** Whether a document of the outcomes waits for a decision poll after the summarize. */
export function waitsForPoll(outcomes: AutomaticSendOutcome[]): boolean {
    return outcomes.some(({ readiness }) => readiness?.state === 'wait' && readiness.reason === 'poll');
}

/** How many documents one cron run sends. The run is daily; the rest wait for the next one. */
export const CRON_SEND_BATCH = 10;

export interface SendDueDocumentsSummary {
    staleReleased: number;
    evaluated: number;
    sent: Array<{ cityId: string; meetingId: string; document: DocumentKind; complete: boolean }>;
    failed: Array<{ cityId: string; meetingId: string; document: DocumentKind; error: string }>;
    waiting: number;
    /** Candidates the setting does not cover (held before the switch-on, a later part, not held). */
    notCovered: number;
    /** Candidates skipped because their automatic attempts are used up (MAX_AUTOMATIC_ATTEMPTS). */
    exhausted: number;
}

/**
 * The daily cron: the authority on automatic sends. It releases the claims of
 * dead senders, then evaluates every candidate meeting of every automatic
 * document and sends a batch of what is ready. The task callbacks and the
 * review completion only make a send immediate; a send they missed happens
 * here. A failure on one candidate is recorded, and the run goes on.
 */
export async function sendDueDocuments({ now = new Date(), limit = CRON_SEND_BATCH }: { now?: Date; limit?: number } = {}): Promise<SendDueDocumentsSummary> {
    const summary: SendDueDocumentsSummary = { staleReleased: 0, evaluated: 0, sent: [], failed: [], waiting: 0, notCovered: 0, exhausted: 0 };
    summary.staleReleased = await failStaleDocumentSends(now);

    for (const document of AUTOMATIC_DOCUMENTS) {
        let after: CandidateCursor | null = null;
        for (;;) {
            const candidates = await findDocumentSendCandidates(document, now, after);
            for (const facts of candidates) {
                if (summary.sent.length + summary.failed.length >= limit) return summary;
                if (attemptsExhausted(facts, document)) {
                    summary.exhausted++;
                    continue;
                }
                summary.evaluated++;
                // The page's facts only filter; the sender reads the meeting again before it claims
                const readiness = evaluateReadiness(document, readinessInputFor(facts, document, now));
                if (readiness.state === 'none') {
                    summary.notCovered++;
                    continue;
                }
                if (!isSendable(readiness)) {
                    summary.waiting++;
                    continue;
                }
                const result = await sendDocument(facts.cityId, facts.id, document, { by: 'automatic' })
                    .catch((error: unknown): SendDocumentResult => ({ success: false, error: errorMessage(error) }));
                if (result.skipped) {
                    summary.waiting++;
                } else if (result.success) {
                    summary.sent.push({ cityId: facts.cityId, meetingId: facts.id, document, complete: result.readiness?.state === 'complete' });
                } else {
                    summary.failed.push({ cityId: facts.cityId, meetingId: facts.id, document, error: result.error ?? 'unknown' });
                }
            }
            if (candidates.length < CANDIDATE_PAGE_SIZE) break;
            const last = candidates[candidates.length - 1];
            after = { dateTime: last.dateTime, cityId: last.cityId, id: last.id };
        }
    }
    return summary;
}

/** What the review completion will send on its own, and to whom. */
export interface DocumentAfterReview {
    document: DocumentKind;
    recipientEmails: string[];
    readiness: Readiness;
}

/**
 * What goes out once the review of this meeting completes: the automatic
 * documents whose setting covers the meeting, evaluated as if the review were
 * done. The completion dialog tells the reviewer. A document the automatic
 * senders leave alone is left out, as the sender skips it.
 */
export async function documentsAfterReview(cityId: string, meetingId: string, now: Date = new Date()): Promise<DocumentAfterReview[]> {
    const facts = await getReadinessFacts(cityId, meetingId);
    if (!facts) return [];
    return AUTOMATIC_DOCUMENTS.flatMap(document => {
        if (skipsAutomaticSend(facts, document)) return [];
        const input = readinessInputFor(facts, document, now, { reviewed: true });
        const readiness = evaluateReadiness(document, input);
        if (readiness.state === 'none') return [];
        return [{ document, recipientEmails: recipientsFor(input.setting), readiness }];
    });
}
