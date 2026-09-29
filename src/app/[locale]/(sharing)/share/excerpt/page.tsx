import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getRealm } from '@/lib/realm.server';
import { getPublicExcerpt } from '@/lib/sharing/excerpts';
import { EXCERPT_SELECTOR_KEYS, parseExcerptSelector, transcriptExcerptPath, localePath, type QueryParams } from '@/lib/sharing/excerptSelector';
import { ShareUnavailable } from '@/components/sharing/SharePageShell';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
interface Props { params: Promise<{ locale: string }>; searchParams: Promise<QueryParams> }

// A link that resolves redirects before any metadata reaches a reader, so only the notice needs any.
export async function generateMetadata(props: Props): Promise<Metadata> {
    const t = await getTranslations({ locale: (await props.params).locale, namespace: 'sharing' });
    return { title: t('unavailableTitle'), robots: { index: false, follow: false }, openGraph: { images: [] }, twitter: { images: [] } };
}

// Links shared before excerpts opened in the transcript. Campaign parameters
// (utm_*, fbclid) go with the reader to the transcript. A `t` does not: the
// player would scroll to it after the transcript lands on the excerpt.
export default async function ExcerptPage(props: Props) {
    const [{ locale }, query] = await Promise.all([props.params, props.searchParams]);
    const selector = parseExcerptSelector(query);
    const result = selector ? await getPublicExcerpt(selector, await getRealm()) : { status: 'invalid' as const };
    if (result.status === 'ok') {
        const extra = new URLSearchParams(Object.entries(query).filter(([key]) => key !== 't' && !EXCERPT_SELECTOR_KEYS.includes(key))
            .flatMap(([key, values]) => [values ?? []].flat().map(value => [key, value]))).toString();
        redirect(`${transcriptExcerptPath(result.excerpt.selector)}${extra ? `&${extra}` : ''}`);
    }
    return <ShareUnavailable locale={locale} changed={result.status === 'source-changed'} meetingUrl={selector ? localePath(locale, `/${selector.cityId}/${selector.meetingId}`) : undefined} />;
}
