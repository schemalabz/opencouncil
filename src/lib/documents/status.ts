// What the admin list shows for each document of a meeting (#874). Pure: the
// facts come from src/lib/db/documentSends.ts, and the unit tests cover the states.
import type { DocumentKind, DocumentSendTrigger } from '@prisma/client';
import type { DocumentSendSummary, ReadinessFacts } from '@/lib/db/documentSends';
import { DOCUMENT_RULES, evaluateReadiness, type WaitReason } from './readiness';
import { DOCUMENT_KINDS, recipientsFor } from './settings';

/**
 * The state of one document of a meeting, as one chip. `unsent`: the rule says
 * the document is ready and nothing went out, which for the minutes means
 * overdue and for the transcript means the reviewer left it unticked. Only the
 * first needs an operator: see `attention` in documentChip.
 */
export type DocumentChipState = 'sent' | 'sentIncomplete' | 'pending' | 'failed' | 'waiting' | 'unsent' | 'notEnabled';

export interface DocumentChip {
    document: DocumentKind;
    state: DocumentChipState;
    /** Subjects without a decision: of the send for sentIncomplete, of the meeting for unsent. */
    missingCount: number;
    recipientEmails: string[];
    sentAt: Date | null;
    trigger: DocumentSendTrigger | null;
    waitReason: WaitReason | null;
    dueAt: Date | null;
    failureReason: string | null;
    /** The "needs attention" filter: failed, sent incomplete, ready but unsent, or reviewed with no agenda. */
    attention: boolean;
}

/** The send that tells the state: the latest sent one, else the latest of all. */
function tellingSend(sends: DocumentSendSummary[], document: DocumentKind): DocumentSendSummary | null {
    const ofDocument = sends
        .filter(send => send.document === document)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return ofDocument.find(send => send.status === 'sent') ?? ofDocument[0] ?? null;
}

export function documentChip(facts: ReadinessFacts, document: DocumentKind, now: Date): DocumentChip {
    const setting = facts.administrativeBody?.documentSendSettings.find(s => s.document === document) ?? null;
    const readiness = evaluateReadiness(document, {
        setting,
        meeting: facts,
        reviewed: facts.taskStatuses.length > 0,
        subjects: facts.subjects.map(subject => ({ id: subject.id, decided: subject.decision !== null })),
        now,
    });
    const send = tellingSend(facts.documentSends, document);
    const base: DocumentChip = {
        document,
        state: 'notEnabled',
        missingCount: 0,
        recipientEmails: send?.recipientEmails ?? recipientsFor(setting),
        sentAt: send?.sentAt ?? null,
        trigger: send?.trigger ?? null,
        waitReason: null,
        dueAt: null,
        failureReason: null,
        attention: false,
    };

    if (send?.status === 'sent') {
        return send.complete
            ? { ...base, state: 'sent' }
            : { ...base, state: 'sentIncomplete', missingCount: send.missingSubjectIds.length, attention: true };
    }
    if (send?.status === 'pending') return { ...base, state: 'pending' };
    if (send?.status === 'failed') return { ...base, state: 'failed', failureReason: send.failureReason, attention: true };

    switch (readiness.state) {
        case 'none':
            return base;
        case 'wait':
            return { ...base, state: 'waiting', waitReason: readiness.reason, dueAt: readiness.dueAt, attention: readiness.reason === 'agenda' };
        case 'complete':
        case 'incomplete': {
            // A document that goes out on its own and has not is overdue. A
            // document sent only when a reviewer ticks it (the transcript) was
            // left unsent by choice: flagging it would fill the filter with
            // every past review that did not send.
            const overdue = DOCUMENT_RULES[document].automation === 'whenReady';
            const missingCount = readiness.state === 'incomplete' ? readiness.missingSubjectIds.length : 0;
            return { ...base, state: 'unsent', missingCount, attention: overdue };
        }
    }
}

/** One chip per document, in the order of DOCUMENT_KINDS. */
export function documentChips(facts: ReadinessFacts, now: Date = new Date()): DocumentChip[] {
    return DOCUMENT_KINDS.map(document => documentChip(facts, document, now));
}

/** The chips the admin list shows: the documents the body sends for the meeting. */
export function visibleDocumentChips(chips: DocumentChip[]): DocumentChip[] {
    return chips.filter(chip => chip.state !== 'notEnabled');
}

export type MeetingDocumentChips = Record<string, DocumentChip[]>;

export function documentChipsByMeeting(facts: ReadinessFacts[], now: Date = new Date()): MeetingDocumentChips {
    return Object.fromEntries(facts.map(meeting => [meeting.id, documentChips(meeting, now)]));
}
