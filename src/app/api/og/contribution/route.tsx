import { getTranslations } from 'next-intl/server';
import { LOCALES, type AppLocale } from '@/i18n/config';
import { getRealm } from '@/lib/realm.server';
import { getPublicContribution } from '@/lib/sharing/contributions';
import { getInitials } from '@/lib/formatters/name';
import { formatDate } from '@/lib/formatters/time';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { localizeText } from '@/lib/serbian';
import { LOGO_BLACK_DATA_URI, OG_FONTS } from '@/lib/og/serverAssets';
import { getPortraitData } from '@/lib/og/portrait';
import { ILLUSTRATION_BOX } from '@/lib/og/illustration';
import { sharedContext, sharedSubjectTile } from '@/lib/og/sharedContent';
import { SharedContentOgImage } from '@/components/og/SharedContentOgImage';
import { renderImage, shareCacheControl } from '@/lib/og/render';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Pairs with the render slot: a hung render must not hold it forever.
export const maxDuration = 60;
export async function GET(request: Request) {
    const query = new URL(request.url).searchParams;
    const locale = LOCALES.includes(query.get('locale') as AppLocale) ? query.get('locale')! : 'el';
    const t = await getTranslations({ locale, namespace: 'sharing' });
    const contribution = query.getAll('id').length === 1 ? await getPublicContribution(query.get('id')!, await getRealm(), locale) : null;
    const [context, subject, portrait] = contribution
        ? await Promise.all([sharedContext(contribution.meeting, locale), sharedSubjectTile(contribution.subject, locale, ILLUSTRATION_BOX.tile), getPortraitData(contribution.speakerImage)])
        : [undefined, undefined, null];
    const speaker = contribution ? contribution.speakerName ?? t('unknownSpeaker') : null;
    return renderImage(<SharedContentOgImage
        markSrc={LOGO_BLACK_DATA_URI}
        locale={locale}
        context={context}
        label={t('contribution')}
        note={contribution ? t('summary') : undefined}
        text={contribution ? localizeText(stripMarkdown(contribution.text), locale) : t('unavailableTitle')}
        attribution={contribution && speaker ? {
            name: speaker,
            initials: getInitials(speaker),
            image: portrait,
            detail: formatDate(contribution.meeting.dateTime, contribution.meeting.city.timezone, locale),
        } : undefined}
        subject={subject}
    />, { width: 1200, height: 630, fonts: OG_FONTS, headers: { 'Cache-Control': shareCacheControl() } });
}
