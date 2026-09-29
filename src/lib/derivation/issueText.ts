import type { TextResolver } from '@/i18n/catalogText';
import { ISSUE_STAGES } from './issueCatalogue';
import type { Issue, IssueCode } from './types';

/** What `renderIssue` needs of a translator; next-intl's `t` and `catalogText` both satisfy it. */
export type IssueTranslator = TextResolver;

/**
 * An issue as a sentence, from the one authored message its code keys.
 *
 * Takes the translator rather than reading the catalog, so a client component
 * can call it with its own `t`; `issueTextEn.ts` is the same outside React.
 *
 * @translationNamespace admin.decisionsPage
 */
export function renderIssue(t: IssueTranslator, issue: Issue): string {
    if (issue.code === 'TALLY_MISMATCH') {
        const diffs = issue.params.diffs.map(d => t('issues.tallyDiff', { ...d })).join('; ');
        return t('issues.messages.TALLY_MISMATCH', { diffs });
    }
    if (issue.code === 'PRESIDING_DISAGREES') {
        const names = issue.params.presiding.flatMap(p => (p.name ? [p.name] : [])).join(', ');
        return t('issues.messages.PRESIDING_DISAGREES', { names });
    }
    return t(`issues.messages.${issue.code}`, { ...issue.params });
}

/** Names the caller already holds: the page's people, and its subjects as «3. Title». */
export interface IssueNames {
    person: (personId: string) => string | undefined;
    subject: (subjectId: string) => string | undefined;
}

/**
 * The issue with the ids its message would print replaced by names.
 *
 * Two messages name something the derivation holds only as an id: the
 * presiding members a meeting's documents disagree about, and the subject a
 * stated change is anchored to when that subject left the order. The
 * derivation has no names to put there, so the caller does it here, from the
 * names it already holds. A presiding member the caller cannot name keeps the
 * name the page printed. Every other issue comes back as it was.
 */
export function nameIssue(issue: Issue, names: IssueNames): Issue {
    if (issue.code === 'PRESIDING_DISAGREES') {
        const presiding = issue.params.presiding.map(p => ({ ...p, name: (p.personId ? names.person(p.personId) : undefined) ?? p.name }));
        return { ...issue, params: { presiding } };
    }
    if (issue.code === 'UNPLACEABLE_ANCHOR' && issue.params.reason === 'noSuchSubject') {
        const subject = names.subject(issue.params.detail);
        return subject ? { ...issue, params: { ...issue.params, detail: subject } } : issue;
    }
    return issue;
}

/**
 * The person an issue is about, as a reader can find them.
 *
 * `member` is a roster match: the issue's `personId`, named. A name that no
 * single person stands behind (`UNMATCHED_NAME`, `NAME_MATCHED_TWICE`) has no
 * person line: the issue's own message prints the name.
 */
export type IssuePersonKind = 'member';
export type IssuePerson = { kind: IssuePersonKind; name: string };

/**
 * Who an issue is about, or null when it concerns no one or nobody knows the
 * name. Decided from the issue's fields, not per code, so a code that starts
 * to carry a `personId` is named without a change here.
 *
 * `nameOf` answers from names the caller already holds: the page's people, a
 * script's roster. It returns undefined for an id it does not know, and the
 * issue then names nobody rather than an id.
 */
export function issuePerson(issue: Issue, nameOf: (personId: string) => string | undefined): IssuePerson | null {
    if (!issue.personId) return null;
    const name = nameOf(issue.personId);
    return name ? { kind: 'member', name } : null;
}

/**
 * `issuePerson` as a label: «Μέλος: …».
 *
 * @translationNamespace admin.decisionsPage
 */
export function renderIssuePerson(t: IssueTranslator, person: IssuePerson): string {
    return t(`issues.person.${person.kind}`, { name: person.name });
}

/**
 * Where a code comes from, as a sentence: every step `ISSUE_STAGES` names for
 * it, joined.
 *
 * The plural is the point — two codes are raised at two different steps, and a
 * reader told only one of them would be told something untrue. The steps are
 * read from the catalogue rather than written out here, so the sentence cannot
 * outlive a change to where a code is raised.
 *
 * @translationNamespace admin.decisionsPage
 */
export function renderIssueStages(t: IssueTranslator, code: IssueCode): string {
    const steps = ISSUE_STAGES[code].map(stage => t(`issues.raisedIn.${stage}`));
    return t('issues.raisedAt', { steps: steps.join(` ${t('issues.raisedJoin')} `) });
}
