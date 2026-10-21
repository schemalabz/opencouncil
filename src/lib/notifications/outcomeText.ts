import type { TextResolver } from '@/i18n/catalogText';
import type { NewsPhase, NotificationOutcome } from './freshness';

/**
 * The sentence for a notification outcome, from the `notificationOutcome`
 * catalog. The UI passes next-intl's `t`; the MCP tools pass the English
 * catalog (catalogText), so an agent reads the sentence an admin reads.
 *
 * @translationNamespace notificationOutcome
 */
export function notificationOutcomeText(t: TextResolver, outcome: NotificationOutcome, phase: NewsPhase): string {
    const subject = t(`phase.${phase}`);
    if (outcome.kind === 'sends') return t('sends', { phase: subject });
    if (outcome.kind === 'waitsForApproval') return t('waitsForApproval', { phase: subject });
    return t('none', { reason: t(`reason.${outcome.reason}`) });
}
