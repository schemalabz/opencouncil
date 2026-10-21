/**
 * Notification outcomes in English, for code with no next-intl context: the
 * MCP tools tell an agent what a task does with notifications in the words an
 * admin reads. Its own module because it reads the `en` catalog, which must not
 * ride into the browser bundle with outcomeText.ts.
 */
import enOutcome from '../../../messages/en/notificationOutcome.json';
import { catalogText } from '@/i18n/catalogText';
import type { NewsPhase, NotificationOutcome } from './freshness';
import { notificationOutcomeText } from './outcomeText';

const t = catalogText({ messages: { notificationOutcome: enOutcome }, namespace: 'notificationOutcome' });

export const notificationOutcomeEn = (outcome: NotificationOutcome, phase: NewsPhase): string =>
    notificationOutcomeText(t, outcome, phase);
