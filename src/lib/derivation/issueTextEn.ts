/**
 * Issue sentences outside React, for the scripts that print them.
 *
 * Its own module because it reads the `en` catalog (~40 KB): `issueText.ts` is
 * imported by client components, and the catalog would ride into the browser
 * bundle for a function only the scripts call.
 */
import { IntlMessageFormat } from 'intl-messageformat';
import enAdmin from '../../../messages/en/admin.json';
import { renderIssue, type IssueTranslator } from './issueText';
import type { Issue } from './types';

const t: IssueTranslator = (key, values) => {
    const message = key.split('.').reduce<unknown>(
        (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
        (enAdmin as { decisionsPage: unknown }).decisionsPage);
    return typeof message === 'string' ? String(new IntlMessageFormat(message, 'en').format(values)) : key;
};

export const issueMessageEn = (issue: Issue): string => renderIssue(t, issue);
