import type { Metadata } from 'next';
import { cache } from 'react';
import { getTranslations } from 'next-intl/server';
import { getRealm, getMetadataBaseFromRequest } from '@/lib/realm.server';
import { getPublicExcerpt } from '@/lib/sharing/excerpts';
import { parseExcerptSelector, serializeExcerptSelector, localePath, type QueryParams } from '@/lib/sharing/excerptSelector';
import { SharedExcerpt } from '@/components/sharing/SharedExcerpt';
import { ShareUnavailable } from '@/components/sharing/SharePageShell';
import { groupExcerptSpeakers } from '@/components/sharing/ExcerptQuote';
import { compactMetadataDescription } from '@/lib/seo/metadataDescription';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
interface Props { params: Promise<{ locale: string }>; searchParams: Promise<QueryParams> }
const resolve = cache(async (query: QueryParams) => {
    const selector = parseExcerptSelector(query);
    return selector ? getPublicExcerpt(selector, await getRealm()) : { status: 'invalid' as const };
});

export async function generateMetadata(props: Props): Promise<Metadata> {
    const [{ locale }, query] = await Promise.all([props.params, props.searchParams]);
    const [result, t, base] = await Promise.all([resolve(query), getTranslations({ locale, namespace: 'sharing' }), getMetadataBaseFromRequest()]);
    if (result.status !== 'ok') return { title: t('unavailableTitle'), robots: { index: false, follow: false }, openGraph: { images: [] }, twitter: { images: [] } };
    const { excerpt } = result;
    const groups = groupExcerptSpeakers(excerpt.runs);
    const speakers = new Set(groups.map(group => group.key));
    const attribution = speakers.size > 1 ? t('speakerCount', { count: speakers.size }) : excerpt.runs[0].speakerName ?? t('unknownSpeaker');
    const title = `${t('excerpt')} · ${attribution}`;
    const previewDescription = groups.slice(0, 2).map(group =>
        `«${compactMetadataDescription(group.text, 220)}»\n— ${compactMetadataDescription(group.speakerName ?? t('unknownSpeaker'), 80)}`
    ).join('\n\n');
    const description = [!excerpt.isReviewed && t('unreviewedNotice'), previewDescription].filter(Boolean).join('\n\n');
    const image = `${base}/api/og/excerpt?${serializeExcerptSelector(excerpt.selector)}`;
    return { title, description, robots: { index: false, follow: true }, openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }] }, twitter: { card: 'summary_large_image', title, description, images: [image] } };
}

export default async function ExcerptPage(props: Props) {
    const [{ locale }, query] = await Promise.all([props.params, props.searchParams]);
    const result = await resolve(query);
    if (result.status === 'ok') return <SharedExcerpt excerpt={result.excerpt} locale={locale} />;
    const selector = parseExcerptSelector(query);
    return <ShareUnavailable locale={locale} changed={result.status === 'source-changed'} meetingUrl={selector ? localePath(locale, `/${selector.cityId}/${selector.meetingId}`) : undefined} />;
}
