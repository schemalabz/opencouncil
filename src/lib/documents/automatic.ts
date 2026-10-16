// The sends nobody asks for (#874): the cron, the end of a decision poll and the
// review completion evaluate a meeting and send what is ready. Callers
// authorize where there is a user; the cron and the poll callback have none.
import "server-only";
import type { DocumentKind } from '@prisma/client';
import {
    failStaleDocumentSends,
    findDocumentSendCandidates,
    getReadinessFacts,
    type ReadinessFacts,
} from '@/lib/db/documentSends';
import { AUTOMATIC_DOCUMENTS, evaluateReadiness, type Readiness, type ReadinessInput } from './readiness';
import { recipientsFor, type DocumentSendRule } from './settings';
import { documents } from './registry';
import { sendDocument, type SendDocumentResult } from './send';

/** The readiness input of one document of a meeting, from the facts of the meeting. */
export function readinessInputFor(facts: ReadinessFacts, document: DocumentKind, now: Date, { reviewed }: { reviewed?: boolean } = {}): ReadinessInput {
    return {
        setting: facts.administrativeBody?.documentSendSettings.find(setting => setting.document === document) ?? null,
        meeting: facts,
        reviewed: reviewed ?? facts.taskStatuses.length > 0,
        subjects: facts.subjects.map(subject => ({ id: subject.id, decided: subject.decision !== null })),
        now,
    };
}

/**
 * How many times the automatic paths try one document of one meeting. A fault
 * that persists (a render that throws, an address the provider refuses) then
 * stops costing a failed row and a Discord alert every day; the chip stays
 * "failed", and an operator can still send it by hand.
 */
export const MAX_AUTOMATIC_ATTEMPTS = 3;

function attemptsExhausted(facts: ReadinessFacts, document: DocumentKind): boolean {
    const failed = facts.documentSends.filter(send => send.document === document && send.automatic && send.status === 'failed');
    return failed.length >= MAX_AUTOMATIC_ATTEMPTS;
}

/**
 * The document already went out, or is going out, for this meeting: a send
 * that is pending or sent, automatic or by hand. Nothing automatic follows it,
 * so an operator's send of overdue minutes is the one the back office gets.
 */
function hasSend(facts: ReadinessFacts, document: DocumentKind): boolean {
    return facts.documentSends.some(send => send.document === document && send.status !== 'failed');
}

/**
 * Send one document of a meeting now, for the readiness that says it is ready.
 * A complete document records the trigger `complete`; the provisional minutes
 * record `threshold`, the moment that made them go out.
 */
async function sendForReadiness(cityId: string, meetingId: string, document: DocumentKind, readiness: Readiness): Promise<SendDocumentResult | null> {
    if (readiness.state !== 'complete' && readiness.state !== 'incomplete') return null;
    return sendDocument(cityId, meetingId, document, (meeting) => documents[document].payload(meeting, readiness), {
        trigger: readiness.state === 'complete' ? 'complete' : 'threshold',
        automatic: true,
        completeness: readiness.state === 'complete'
            ? { complete: true, missingSubjectIds: [] }
            : { complete: false, missingSubjectIds: readiness.missingSubjectIds },
    });
}

export interface AutomaticSendOutcome {
    document: DocumentKind;
    readiness: Readiness;
    result: SendDocumentResult | null;
}

/**
 * Evaluate every automatic document of one meeting and send what is ready.
 * The poll callback and the review completion call this through after(), so
 * a person waits for none of it; the cron calls it for each candidate. Never
 * throws: the unique index stops a double send, and a failure is in the row.
 */
export async function sendReadyDocuments(cityId: string, meetingId: string, now: Date = new Date()): Promise<AutomaticSendOutcome[]> {
    try {
        const facts = await getReadinessFacts(cityId, meetingId);
        if (!facts) return [];
        const outcomes: AutomaticSendOutcome[] = [];
        for (const document of AUTOMATIC_DOCUMENTS) {
            const readiness = evaluateReadiness(document, readinessInputFor(facts, document, now));
            const result = hasSend(facts, document) || attemptsExhausted(facts, document) ? null : await sendForReadiness(cityId, meetingId, document, readiness);
            outcomes.push({ document, readiness, result });
        }
        return outcomes;
    } catch (error) {
        console.error(`[sendReadyDocuments] ${cityId}/${meetingId}:`, error);
        return [];
    }
}

/** How many documents one cron run sends. The run is daily; the rest wait for the next one. */
export const CRON_SEND_BATCH = 10;

export interface SendDueDocumentsSummary {
    staleReleased: number;
    evaluated: number;
    sent: Array<{ cityId: string; meetingId: string; document: DocumentKind; complete: boolean }>;
    failed: Array<{ cityId: string; meetingId: string; document: DocumentKind; error: string }>;
    waiting: number;
    /** Candidates skipped because their automatic attempts are used up (MAX_AUTOMATIC_ATTEMPTS). */
    exhausted: number;
}

/**
 * The daily cron: the authority on automatic sends. It releases the claims of
 * dead senders, then evaluates every candidate meeting of every automatic
 * document and sends a batch of what is ready. The poll callback and the
 * review completion only make a send immediate; a send they missed happens here.
 */
export async function sendDueDocuments({ now = new Date(), limit = CRON_SEND_BATCH }: { now?: Date; limit?: number } = {}): Promise<SendDueDocumentsSummary> {
    const summary: SendDueDocumentsSummary = { staleReleased: 0, evaluated: 0, sent: [], failed: [], waiting: 0, exhausted: 0 };
    summary.staleReleased = await failStaleDocumentSends(now);

    for (const document of AUTOMATIC_DOCUMENTS) {
        const candidates = await findDocumentSendCandidates(document, now);
        for (const facts of candidates) {
            if (summary.sent.length + summary.failed.length >= limit) return summary;
            if (attemptsExhausted(facts, document)) {
                summary.exhausted++;
                continue;
            }
            summary.evaluated++;
            const readiness = evaluateReadiness(document, readinessInputFor(facts, document, now));
            const result = await sendForReadiness(facts.cityId, facts.id, document, readiness);
            if (result === null || result.skipped) {
                summary.waiting++;
            } else if (result.success) {
                summary.sent.push({ cityId: facts.cityId, meetingId: facts.id, document, complete: readiness.state === 'complete' });
            } else {
                summary.failed.push({ cityId: facts.cityId, meetingId: facts.id, document, error: result.error ?? 'unknown' });
            }
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
 * done. The completion dialog tells the reviewer.
 */
export async function documentsAfterReview(cityId: string, meetingId: string, now: Date = new Date()): Promise<DocumentAfterReview[]> {
    const facts = await getReadinessFacts(cityId, meetingId);
    if (!facts) return [];
    return AUTOMATIC_DOCUMENTS.flatMap(document => {
        const input = readinessInputFor(facts, document, now, { reviewed: true });
        const readiness = evaluateReadiness(document, input);
        if (readiness.state === 'none') return [];
        const setting: DocumentSendRule | null = input.setting;
        return [{ document, recipientEmails: recipientsFor(setting), readiness }];
    });
}
