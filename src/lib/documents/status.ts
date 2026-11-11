// Where a document of a meeting stands with the back office (#874), for the
// minutes line of the decisions page and the automatic senders. Pure: the
// facts come from src/lib/db/documentSends.ts, and the unit tests cover the states.
import type { DocumentKind, DocumentSendTrigger } from '@prisma/client';
import { isAutomaticSend, missingCountOf, takesSlot, type DocumentSendSummary, type ReadinessFacts } from '@/lib/db/types/documentSend';
import { evaluateReadiness, readinessInputFor, type WaitReason } from './readiness';
import { MAX_AUTOMATIC_ATTEMPTS, recipientsFor, staleBefore } from './settings';

/**
 * Where one document of a meeting stands. `unsent`: the rule says the
 * document is ready and nothing went out. `byHandOnly`: the meeting was held
 * before the body switched the document on, so only a send by hand covers it.
 * `notEnabled`: the body does not send the document.
 */
export type DocumentStateKind = 'sent' | 'sentIncomplete' | 'pending' | 'unconfirmed' | 'failed' | 'waiting' | 'unsent' | 'byHandOnly' | 'notEnabled';

export interface DocumentState {
    state: DocumentStateKind;
    /** Subjects without a decision: of the send for sentIncomplete, of the meeting for unsent. */
    missingCount: number;
    recipientEmails: string[];
    sentAt: Date | null;
    trigger: DocumentSendTrigger | null;
    waitReason: WaitReason | null;
    dueAt: Date | null;
    failureReason: string | null;
    /** When a send went out before the latest attempt, which did not: a resend that failed, or is in progress. */
    earlierSentAt: Date | null;
}

/** The sends of one document, newest first: the facts select them in that order. */
function sendsOf(facts: ReadinessFacts, kind: DocumentKind): DocumentSendSummary[] {
    return facts.documentSends.filter(send => send.kind === kind);
}

/**
 * Whether the automatic senders leave a document of a meeting alone: it went
 * out or is going out (a send that holds the slot, automatic or by hand, so an
 * operator's send of overdue minutes is the one the back office gets), or its
 * automatic attempts are used up. The cron, the hooks and the review dialog
 * all read this one rule.
 */
export function skipsAutomaticSend(facts: ReadinessFacts, kind: DocumentKind): boolean {
    const sends = sendsOf(facts, kind);
    return sends.some(takesSlot) || attemptsExhausted(facts, kind);
}

/** Whether the automatic attempts of a document are used up (MAX_AUTOMATIC_ATTEMPTS). */
export function attemptsExhausted(facts: ReadinessFacts, kind: DocumentKind): boolean {
    return sendsOf(facts, kind).filter(send => isAutomaticSend(send) && send.status === 'failed').length >= MAX_AUTOMATIC_ATTEMPTS;
}

export function documentState(facts: ReadinessFacts, kind: DocumentKind, now: Date): DocumentState {
    const input = readinessInputFor(facts, kind, now);
    const readiness = evaluateReadiness(kind, input);
    // The latest attempt tells the state, so a resend that fails shows as failed
    const [send = null] = sendsOf(facts, kind);
    const lastSent = sendsOf(facts, kind).find(earlier => earlier.status === 'sent') ?? null;
    const base: DocumentState = {
        state: 'notEnabled',
        missingCount: 0,
        recipientEmails: send?.recipientEmails ?? recipientsFor(input.setting),
        sentAt: send?.sentAt ?? null,
        trigger: send?.trigger ?? null,
        waitReason: null,
        dueAt: null,
        failureReason: null,
        earlierSentAt: lastSent && lastSent !== send ? lastSent.sentAt : null,
    };

    const stale = send !== null && send.createdAt < staleBefore(now);
    if (send?.status === 'sent') {
        const missingCount = missingCountOf(send);
        return missingCount === 0 ? { ...base, state: 'sent' } : { ...base, state: 'sentIncomplete', missingCount };
    }
    // A pending claim never reached the provider: once stale, its sender died,
    // and a send by hand is safe, so it reads as failed until the cron frees it.
    if (send?.status === 'pending') return stale ? { ...base, state: 'failed', failureReason: 'stale' } : { ...base, state: 'pending' };
    if (send?.status === 'sending') {
        // A sender that handed the email over and never recorded the outcome:
        // the email may have gone out, and nothing sends it again on its own.
        return { ...base, state: stale ? 'unconfirmed' : 'pending' };
    }
    if (send?.status === 'failed') return { ...base, state: 'failed', failureReason: send.failureReason };

    switch (readiness.state) {
        case 'none':
            // Held before the body switched the document on: nothing goes out
            // on its own, but an operator may still send it.
            return readiness.reason === 'beforeSwitch' ? { ...base, state: 'byHandOnly' } : base;
        case 'wait':
            return { ...base, state: 'waiting', waitReason: readiness.reason, dueAt: readiness.dueAt };
        case 'complete':
        case 'incomplete':
            return { ...base, state: 'unsent', missingCount: readiness.state === 'incomplete' ? readiness.missingSubjectIds.length : 0 };
    }
}

/** The state of a document that the body sends, for a page to show; null when the body does not send it. */
export function shownDocumentState(facts: ReadinessFacts, kind: DocumentKind, now: Date): DocumentState | null {
    const state = documentState(facts, kind, now);
    return state.state === 'notEnabled' ? null : state;
}
