import 'server-only';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getMetadataBaseFromRequest } from '@/lib/realm.server';
import { compactMetadataDescription } from '@/lib/seo/metadataDescription';
import { groupExcerptSpeakers } from '@/components/sharing/ExcerptQuote';
import { serializeExcerptSelector, transcriptExcerptPath } from '@/lib/sharing/excerptSelector';
import { shareCardMetadata } from '@/lib/sharing/shareCard';
import type { PublicExcerpt } from '@/lib/sharing/excerpts';

export async function excerptMetadata(excerpt: PublicExcerpt, locale: string): Promise<Metadata> {
    const [t, base] = await Promise.all([getTranslations({ locale, namespace: 'sharing' }), getMetadataBaseFromRequest()]);
    const groups = groupExcerptSpeakers(excerpt.runs);
    const speakers = new Set(groups.map(group => group.key));
    const attribution = speakers.size > 1 ? t('speakerCount', { count: speakers.size }) : excerpt.runs[0].speakerName ?? t('unknownSpeaker');
    const title = `${t('excerpt')} · ${attribution}`;
    const previewDescription = groups.slice(0, 2).map(group =>
        `«${compactMetadataDescription(group.text, 220)}»\n— ${compactMetadataDescription(group.speakerName ?? t('unknownSpeaker'), 80)}`
    ).join('\n\n');
    const description = [!excerpt.isReviewed && t('unreviewedNotice'), previewDescription].filter(Boolean).join('\n\n');
    const image = `${base}/api/og/excerpt?${serializeExcerptSelector(excerpt.selector)}`;
    // The transcript's canonical names the meeting. og:url keeps a scraper on the shared excerpt.
    return shareCardMetadata({ title, description, image, url: `${base}${transcriptExcerptPath(excerpt.selector)}` });
}
