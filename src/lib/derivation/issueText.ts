import type { Issue } from './types';

/** What `renderIssue` needs of a translator; next-intl's `t` and the direct resolver both satisfy it. */
export type IssueTranslator = (key: string, values?: Record<string, string | number>) => string;

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
