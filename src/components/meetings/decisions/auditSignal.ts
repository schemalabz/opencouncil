import type { DerivedVoteRow, Issue, IssueCode } from '@/lib/derivation/types';

const SEVERITY_ORDER: Record<Issue['severity'], number> = { error: 0, warning: 1, info: 2 };

/**
 * What the audit line says about a subject, in the order the line prefers:
 * an issue if there is one, then the states the derivation left the outcome in.
 *
 * - `issues` — something the derivation could not settle.
 * - `phraseOnly` — the outcome is printed from the document's own phrase and
 *   nobody is behind it.
 * - `inferredVotes` — votes the derivation concluded from who was present.
 * - `stated` — every vote the derivation holds is a name the document printed.
 */
export type AuditKind = 'issues' | 'phraseOnly' | 'inferredVotes' | 'stated';

export interface AuditSignal {
    severity: Issue['severity'];
    kind: AuditKind;
    /** The code the phrase names. Null for every kind but `issues`. */
    code: IssueCode | null;
    /**
     * The issue behind the phrase, so the line can state it in full when a
     * reader asks. Its message is parameterised per row — the name that went
     * unmatched, the tally that disagreed — so the code alone cannot
     * reconstruct it. Null for every kind but `issues`.
     */
    issue: Issue | null;
    /** Issues this subject has beyond the one the phrase names. */
    extraIssues: number;
    /** Votes the derivation inferred, out of every vote it derived. */
    inferred: number;
    derivedVotes: number;
    /** Whether the «Χρειάζονται έλεγχο» filter selects this subject. */
    needsCheck: boolean;
}

/**
 * The one line a subject gets in audit mode, or null when it has nothing to say.
 *
 * Grey is not a defect and the severity says so: only an issue can raise the
 * dot above `info`. A body that names only its dissenters derives the rest of
 * every vote from the roll call, so `inferredVotes` is the healthy reading of
 * such a meeting and has to stay quiet — a warning on every row of a correct
 * meeting is the mode crying wolf.
 *
 * A subject with no issue, no phrase-only outcome and no derived vote gets no
 * line at all: an empty row has nothing about its outcome to audit, and a line
 * saying so on every unlinked subject is the same noise by another route.
 */
export function auditSignalFor(input: {
    issues: Issue[];
    phraseOnly: boolean;
    votes: DerivedVoteRow[];
}): AuditSignal | null {
    const { issues, phraseOnly, votes } = input;
    const inferred = votes.filter(v => v.origin === 'inferred').length;
    const base = {
        code: null,
        issue: null,
        extraIssues: 0,
        inferred,
        derivedVotes: votes.length,
        needsCheck: issues.length > 0,
    };

    if (issues.length > 0) {
        const worst = [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])[0];
        return {
            ...base, severity: worst.severity, kind: 'issues', code: worst.code, issue: worst,
            extraIssues: issues.length - 1,
        };
    }
    if (phraseOnly) return { ...base, severity: 'info', kind: 'phraseOnly' };
    if (votes.length === 0) return null;
    return { ...base, severity: 'info', kind: inferred > 0 ? 'inferredVotes' : 'stated' };
}
