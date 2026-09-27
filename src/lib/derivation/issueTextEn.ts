/**
 * Issue sentences in English, for code with no next-intl context: the tests
 * that check each code's message, and reports that a command prints.
 *
 * Its own module because it reads the `en` catalog: `issueText.ts` is imported
 * by client components, and the catalog would ride into the browser bundle for a
 * function that no page calls.
 */
import enAdmin from '../../../messages/en/admin.json';
import { catalogText } from '@/i18n/catalogText';
import { renderIssue } from './issueText';
import type { Issue } from './types';

const t = catalogText({ messages: enAdmin, namespace: 'decisionsPage' });

export const issueMessageEn = (issue: Issue): string => renderIssue(t, issue);
