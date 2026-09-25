import type { TextResolver } from '@/i18n/catalogText';
import { ISSUE_STAGES } from './issueCatalogue';
import type { Issue, IssueCode } from './types';

/** What `renderIssue` needs of a translator; next-intl's `t` and `catalogText` both satisfy it. */
export type IssueTranslator = TextResolver;

/**
 * An issue as a sentence, from the one authored message its code keys.
 *
 * Takes the translator rather than reading the catalog, so a client component
 * can call it with its own `t`; `issueTextEn.ts` is the same for the scripts.
 *
 * @translationNamespace admin.decisionsPage
 */
export function renderIssue(t: IssueTranslator, issue: Issue): string {
    if (issue.code === 'TALLY_MISMATCH') {
        const diffs = issue.params.diffs.map(d => t('issues.tallyDiff', { ...d })).join('; ');
        return t('issues.messages.TALLY_MISMATCH', { diffs });
    }
    return t(`issues.messages.${issue.code}`, { ...issue.params });
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
