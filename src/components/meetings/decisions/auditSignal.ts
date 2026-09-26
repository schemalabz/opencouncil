import { ISSUE_SEVERITY, worstIssue, type IssueSeverity } from '@/lib/derivation/issueCatalogue';
import { issuePerson, type IssuePerson } from '@/lib/derivation/issueText';
import type { DerivedVoteRow, Issue, IssueCode } from '@/lib/derivation/types';

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
    /** The catalogue's severity for `code`, or `info` when the line names no code. */
    severity: IssueSeverity;
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
    /** Who `issue` is about, named from the page's people. Null when it is about nobody, and for every kind but `issues`. */
    person: IssuePerson | null;
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
    /** Names the person an issue is about; undefined for an id the page does not hold. */
    personName: (personId: string) => string | undefined;
}): AuditSignal | null {
    const { issues, phraseOnly, votes, personName } = input;
    const inferred = votes.filter(v => v.origin === 'inferred').length;
    const base = {
        code: null,
        issue: null,
        person: null,
        extraIssues: 0,
        inferred,
        derivedVotes: votes.length,
        needsCheck: issues.length > 0,
    };

    const worst = worstIssue(issues);
    if (worst) {
        return {
            ...base, severity: ISSUE_SEVERITY[worst.code], kind: 'issues', code: worst.code, issue: worst,
            person: issuePerson(worst, personName), extraIssues: issues.length - 1,
        };
    }
    if (phraseOnly) return { ...base, severity: 'info', kind: 'phraseOnly' };
    if (votes.length === 0) return null;
    return { ...base, severity: 'info', kind: inferred > 0 ? 'inferredVotes' : 'stated' };
}
