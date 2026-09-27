import { ISSUE_SEVERITY, worstIssue, type IssueSeverity } from '@/lib/derivation/issueCatalogue';
import { issuePerson, type IssuePerson } from '@/lib/derivation/issueText';
import type { DerivedVoteRow, Issue, IssueCode } from '@/lib/derivation/types';

/**
 * What the audit line says about a subject, in the order the line prefers:
 * an issue if there is one, then the states the derivation left the outcome in.
 *
 * - `issues` — something the derivation could not settle.
 * - `inferredVotes` — votes the derivation concluded from who was present.
 * - `stated` — every vote the derivation holds is a name the document printed.
 */
export type AuditKind = 'issues' | 'inferredVotes' | 'stated';

/** One issue of a subject, with the person it is about named from the page's people. */
export interface AuditIssue { issue: Issue; person: IssuePerson | null }

export interface AuditSignal {
    /** The catalogue's severity for `code`, or `info` when the line names no code. */
    severity: IssueSeverity;
    kind: AuditKind;
    /** The code the phrase names. Null for every kind but `issues`. */
    code: IssueCode | null;
    /**
     * Every issue of the subject, in the order the derivation raised them: what
     * the row under the subject lists when the line is pressed. Each message is
     * parameterised per row — the name that went unmatched, the tally that
     * disagreed — so the codes alone cannot reconstruct them. Empty for every
     * kind but `issues`.
     */
    issues: AuditIssue[];
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
 * A subject with no issue and no derived vote gets no
 * line at all: an empty row has nothing about its outcome to audit, and a line
 * saying so on every unlinked subject is the same noise by another route.
 */
export function auditSignalFor(input: {
    issues: Issue[];
    votes: DerivedVoteRow[];
    /** Names the person an issue is about; undefined for an id the page does not hold. */
    personName: (personId: string) => string | undefined;
}): AuditSignal | null {
    const { issues, votes, personName } = input;
    const inferred = votes.filter(v => v.origin === 'inferred').length;
    const base = {
        code: null,
        issues: [],
        extraIssues: 0,
        inferred,
        derivedVotes: votes.length,
        needsCheck: issues.length > 0,
    };

    const worst = worstIssue(issues);
    if (worst) {
        return {
            ...base, severity: ISSUE_SEVERITY[worst.code], kind: 'issues', code: worst.code, extraIssues: issues.length - 1,
            issues: issues.map(issue => ({ issue, person: issuePerson(issue, personName) })),
        };
    }
    if (votes.length === 0) return null;
    return { ...base, severity: 'info', kind: inferred > 0 ? 'inferredVotes' : 'stated' };
}
