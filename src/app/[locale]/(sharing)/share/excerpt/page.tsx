import type { Metadata } from 'next';
import { cache } from 'react';
import { getTranslations } from 'next-intl/server';
import { getRealm } from '@/lib/realm.server';
import { getPublicExcerpt } from '@/lib/sharing/excerpts';
import { excerptMetadata } from '@/lib/sharing/excerptMetadata';
import { parseExcerptSelector, localePath, type QueryParams } from '@/lib/sharing/excerptSelector';
import { SharedExcerpt } from '@/components/sharing/SharedExcerpt';
import { ShareUnavailable } from '@/components/sharing/SharePageShell';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
interface Props { params: Promise<{ locale: string }>; searchParams: Promise<QueryParams> }
const resolve = cache(async (query: QueryParams) => {
    const selector = parseExcerptSelector(query);
    return selector ? getPublicExcerpt(selector, await getRealm()) : { status: 'invalid' as const };
});

export async function generateMetadata(props: Props): Promise<Metadata> {
    const [{ locale }, query] = await Promise.all([props.params, props.searchParams]);
    const [result, t] = await Promise.all([resolve(query), getTranslations({ locale, namespace: 'sharing' })]);
    if (result.status !== 'ok') return { title: t('unavailableTitle'), robots: { index: false, follow: false }, openGraph: { images: [] }, twitter: { images: [] } };
    return { ...await excerptMetadata(result.excerpt, locale), robots: { index: false, follow: true } };
}

export default async function ExcerptPage(props: Props) {
    const [{ locale }, query] = await Promise.all([props.params, props.searchParams]);
    const result = await resolve(query);
    if (result.status === 'ok') return <SharedExcerpt excerpt={result.excerpt} locale={locale} />;
    const selector = parseExcerptSelector(query);
    return <ShareUnavailable locale={locale} changed={result.status === 'source-changed'} meetingUrl={selector ? localePath(locale, `/${selector.cityId}/${selector.meetingId}`) : undefined} />;
}
