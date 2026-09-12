import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { getRealm } from '@/lib/realm.server';
import { getPublicExcerpt } from '@/lib/sharing/excerpts';
import { parseExcerptSelector } from '@/lib/sharing/excerptSelector';
import { getLocalizedName } from '@/lib/formatters/name';
import { formatDate } from '@/lib/formatters/time';
import { SHARING_OG_FONTS } from '@/lib/og/sharingAssets';
import { SharedContentOgImage } from '@/components/og/SharedContentOgImage';
import { groupExcerptSpeakers } from '@/components/sharing/ExcerptQuote';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) {
    const selector = parseExcerptSelector(new URL(request.url).searchParams);
    const locale = selector?.textLocale ?? 'el';
    const t = await getTranslations({ locale, namespace: 'sharing' });
    const result = selector ? await getPublicExcerpt(selector, await getRealm()) : null;
    const excerpt = result?.status === 'ok' ? result.excerpt : null;
    const groups = excerpt ? groupExcerptSpeakers(excerpt.runs) : [];
    return new ImageResponse(<SharedContentOgImage
        label={t(excerpt && !excerpt.isReviewed ? 'unreviewedLabel' : 'excerpt')} title={excerpt?.subject?.name ?? (excerpt ? getLocalizedName(excerpt.meeting, locale) : '')}
        text={excerpt ? excerpt.runs.map(run => run.text).join(' ') : t('unavailableTitle')}
        attribution={groups.length === 1 ? groups[0].speakerName ?? t('unknownSpeaker') : undefined}
        passages={groups.length > 1 ? groups.map(group => ({ speakerName: group.speakerName ?? t('unknownSpeaker'), text: group.text })) : undefined}
        additionalSpeakers={groups.length > 2 ? t('additionalPassages', { count: groups.length - 2 }) : undefined}
        administrativeBody={excerpt?.meeting.administrativeBody ? getLocalizedName(excerpt.meeting.administrativeBody, locale) : undefined}
        context={excerpt ? `${getLocalizedName(excerpt.meeting.city, locale)} · ${formatDate(excerpt.meeting.dateTime, excerpt.meeting.city.timezone, locale)}` : undefined}
        quote={!!excerpt}
    />, { width: 1200, height: 630, fonts: SHARING_OG_FONTS, headers: { 'Cache-Control': 'private, no-store' } });
}
