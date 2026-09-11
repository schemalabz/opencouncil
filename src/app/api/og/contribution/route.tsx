import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { LOCALES, type AppLocale } from '@/i18n/config';
import { getRealm } from '@/lib/realm.server';
import { getPublicContribution } from '@/lib/sharing/contributions';
import { getLocalizedName } from '@/lib/formatters/name';
import { formatDate } from '@/lib/formatters/time';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { localizeText } from '@/lib/serbian';
import { SHARING_OG_FONTS } from '@/lib/og/sharingAssets';
import { SharedContentOgImage } from '@/components/og/SharedContentOgImage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) {
    const query = new URL(request.url).searchParams;
    const locale = LOCALES.includes(query.get('locale') as AppLocale) ? query.get('locale')! : 'el';
    const t = await getTranslations({ locale, namespace: 'sharing' });
    const contribution = query.getAll('id').length === 1 ? await getPublicContribution(query.get('id')!, await getRealm(), locale) : null;
    return new ImageResponse(<SharedContentOgImage
        label={t('summary')}
        title={contribution ? localizeText(contribution.subject.name, locale) : ''}
        text={contribution ? localizeText(stripMarkdown(contribution.text), locale) : t('unavailableTitle')}
        attribution={contribution ? contribution.speakerName ?? t('unknownSpeaker') : undefined}
        speakerImage={contribution?.speakerImage}
        administrativeBody={contribution?.meeting.administrativeBody ? getLocalizedName(contribution.meeting.administrativeBody, locale) : undefined}
        context={contribution ? `${getLocalizedName(contribution.meeting.city, locale)} · ${formatDate(contribution.meeting.dateTime, contribution.meeting.city.timezone, locale)}` : undefined}
    />, { width: 1200, height: 630, fonts: SHARING_OG_FONTS, headers: { 'Cache-Control': 'private, no-store' } });
}
