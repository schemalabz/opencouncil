// Where a document of a meeting stands with the back office (#874), for the
// minutes line of the decisions page. Pure: the facts come from
// src/lib/db/documentSends.ts, and the unit tests cover the states.
import type { DocumentKind, DocumentSendTrigger } from '@prisma/client';
import type { DocumentSendSummary, ReadinessFacts } from '@/lib/db/types';
import { evaluateReadiness, type WaitReason } from './readiness';
import { recipientsFor, STALE_PENDING_MINUTES } from './settings';

/**
 * Where one document of a meeting stands. `unsent`: the rule says the
 * document is ready and nothing went out. `byHandOnly`: the meeting was held
 * before the body switched the document on, so only a send by hand covers it.
 * `notEnabled`: the body does not send the document.
 */
export type DocumentStateKind = 'sent' | 'sentIncomplete' | 'pending' | 'unconfirmed' | 'failed' | 'waiting' | 'unsent' | 'byHandOnly' | 'notEnabled';

export interface DocumentState {
    document: DocumentKind;
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

/**
 * The send that tells the state, the latest attempt, and the latest send
 * that went out. A resend that fails must show as failed, not hide behind an
 * earlier delivery.
 */
function tellingSends(sends: DocumentSendSummary[], document: DocumentKind): { latest: DocumentSendSummary | null; lastSent: DocumentSendSummary | null } {
    const ofDocument = sends
        .filter(send => send.document === document)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return { latest: ofDocument[0] ?? null, lastSent: ofDocument.find(send => send.status === 'sent') ?? null };
}

export function documentState(facts: ReadinessFacts, document: DocumentKind, now: Date): DocumentState {
    const setting = facts.administrativeBody?.documentSendSettings.find(s => s.document === document) ?? null;
    const readiness = evaluateReadiness(document, {
        setting,
        meeting: facts,
        reviewed: facts.taskStatuses.length > 0,
        subjects: facts.subjects.map(subject => ({ id: subject.id, decided: subject.decision !== null })),
        hasAgenda: facts._count.subjects > 0,
        now,
    });
    const { latest: send, lastSent } = tellingSends(facts.documentSends, document);
    const base: DocumentState = {
        document,
        state: 'notEnabled',
        missingCount: 0,
        recipientEmails: send?.recipientEmails ?? recipientsFor(setting),
        sentAt: send?.sentAt ?? null,
        trigger: send?.trigger ?? null,
        waitReason: null,
        dueAt: null,
        failureReason: null,
        earlierSentAt: lastSent && lastSent !== send ? lastSent.sentAt : null,
    };

    if (send?.status === 'sent') {
        return send.complete
            ? { ...base, state: 'sent' }
            : { ...base, state: 'sentIncomplete', missingCount: send.missingSubjectIds.length };
    }
    if (send?.status === 'pending') return { ...base, state: 'pending' };
    if (send?.status === 'sending') {
        // A sender that handed the email over and never recorded the outcome:
        // the email may have gone out, and nothing sends it again on its own.
        const stuck = now.getTime() - send.createdAt.getTime() > STALE_PENDING_MINUTES * 60 * 1000;
        return { ...base, state: stuck ? 'unconfirmed' : 'pending' };
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
