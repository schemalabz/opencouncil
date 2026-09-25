/**
 * The conventions as sentences for the extraction prompt.
 *
 * Its own module because it reads the `en` catalog, and
 * `decisionConventions.ts` is imported by client components — the catalog would
 * ride into the browser bundle for two functions only the poll request calls.
 */
import "server-only";
import { CONVENTION_FLAGS, normalizeAnchors, type DecisionConventions } from './decisionConventions';
import { catalogText } from '@/i18n/catalogText';
import enAdmin from '../../messages/en/admin.json';

/**
 * The English glossary, resolved by dotted key; the extractor reads English.
 *
 * A key with no entry renders as nothing, so `renderConventionsText` drops the
 * line: a dotted path in the prompt would be worse than a sentence less.
 */
export const conventionsGlossaryEn = catalogText({
    messages: enAdmin, namespace: 'conventions', onMissing: () => '',
});

/**
 * The sentences the extractor is told about a body, rendered from the glossary.
 * `t` is the `admin.conventions` translator for locale `en`; opencouncil owns the
 * wording, opencouncil-tasks pastes the text into the prompt.
 */
export function renderConventionsText(c: DecisionConventions, t: (key: string) => string): string {
    const anchors = normalizeAnchors(c.attendanceChangeAnchors);
    const lines = [
        t(`rollCallLayout.${c.rollCallLayout}.hint`),
        c.presentListMeaning === 'unknown' ? '' : t(`presentListMeaning.${c.presentListMeaning}.hint`),
        anchors.length
            ? `${t('anchors.some')} ${anchors.map(a => t(`attendanceChangeAnchors.${a}.label`)).join(', ')}.`
            : t('anchors.none'),
        ...CONVENTION_FLAGS.filter(f => c[f]).map(f => t(`${f}.hint`)),
        c.namedVoters === 'none' ? '' : t(`namedVoters.${c.namedVoters}.hint`),
        c.notes ? `Notes from the survey: ${c.notes}` : '',
    ].filter(Boolean);
    return lines.join('\n');
}
