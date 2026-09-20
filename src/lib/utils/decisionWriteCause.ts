/**
 * Why a write on the decisions page failed.
 *
 * The decisions route, and the two server actions beside it, fail in a closed
 * set of ways. Each one carries an English sentence that a city admin must
 * never read, so the page maps the cause onto its own copy: the row panel says
 * what went wrong, and the toasts stop quoting the server.
 *
 * `unknown` is the fallback. A server action's message does not survive the
 * RSC boundary in production, so a cause that only the message names arrives
 * as `unknown` there — which is still a sentence the reader can act on, never
 * an English one.
 */
export type DecisionWriteCauseCode =
    | 'adaLinkedElsewhere'
    | 'subjectHasDecision'
    | 'candidateResolved'
    | 'candidateNotFound'
    | 'candidateNotDismissed'
    | 'subjectNotFound'
    | 'notAllowed'
    | 'otherCity'
    | 'unknown';

export interface DecisionWriteCause {
    code: DecisionWriteCauseCode;
    /** The subject that already holds the ΑΔΑ, when the server named it. */
    subjectId?: string;
}

/** A Record rather than an array: it makes a new code without a runtime entry a type error. */
const CAUSE_CODES: Record<DecisionWriteCauseCode, true> = {
    adaLinkedElsewhere: true,
    subjectHasDecision: true,
    candidateResolved: true,
    candidateNotFound: true,
    candidateNotDismissed: true,
    subjectNotFound: true,
    notAllowed: true,
    otherCity: true,
    unknown: true,
};

function isCauseCode(value: string): value is DecisionWriteCauseCode {
    return Object.prototype.hasOwnProperty.call(CAUSE_CODES, value);
}

/**
 * A write failure that names its own cause.
 *
 * Thrown where the server knows more than its sentence says — the subject that
 * holds a contested ΑΔΑ, for one — so the page can name that subject instead of
 * asking the reader to go and look for it.
 */
export class DecisionWriteError extends Error {
    readonly writeCause: DecisionWriteCause;

    constructor(writeCause: DecisionWriteCause, message: string) {
        super(message);
        this.name = 'DecisionWriteError';
        this.writeCause = writeCause;
    }
}

/** Every English sentence the server throws or returns, and what it means. */
const CAUSE_BY_MESSAGE: Record<string, DecisionWriteCauseCode> = {
    'This decision is already linked to another subject': 'adaLinkedElsewhere',
    'Subject already has a decision — remove it first': 'subjectHasDecision',
    'Candidate is already resolved': 'candidateResolved',
    'Candidate was resolved concurrently': 'candidateResolved',
    'Candidate not found': 'candidateNotFound',
    'Candidate is not dismissed': 'candidateNotDismissed',
    'Subject not found in this meeting': 'subjectNotFound',
    'Superadmin required': 'notAllowed',
    'Superadmin required for forced re-extraction': 'notAllowed',
    'Cannot reassign a decision that belongs to a different city': 'otherCity',
};

export function causeFromMessage(message: string): DecisionWriteCause {
    return { code: CAUSE_BY_MESSAGE[message] ?? 'unknown' };
}

/** The cause a route's JSON error body states, by code when it sends one and by sentence otherwise. */
export function causeFromPayload(payload: unknown): DecisionWriteCause {
    if (typeof payload !== 'object' || payload === null) return { code: 'unknown' };
    const body = payload as { error?: unknown; code?: unknown; subjectId?: unknown };
    if (typeof body.code === 'string' && isCauseCode(body.code)) {
        return typeof body.subjectId === 'string'
            ? { code: body.code, subjectId: body.subjectId }
            : { code: body.code };
    }
    return typeof body.error === 'string' ? causeFromMessage(body.error) : { code: 'unknown' };
}

/** The cause behind anything the page caught. */
export function decisionWriteCause(error: unknown): DecisionWriteCause {
    if (error instanceof DecisionWriteError) return error.writeCause;
    return error instanceof Error ? causeFromMessage(error.message) : { code: 'unknown' };
}
