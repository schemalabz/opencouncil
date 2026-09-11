import 'server-only';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getMetadataBaseFromRequest } from '@/lib/realm.server';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { compactMetadataDescription } from '@/lib/seo/metadataDescription';
import { localizeText } from '@/lib/serbian';
import type { PublicContribution } from './contributions';

export async function contributionMetadata(contribution: PublicContribution, locale: string): Promise<Metadata> {
    const [t, base] = await Promise.all([getTranslations({ locale, namespace: 'sharing' }), getMetadataBaseFromRequest()]);
    const title = `${contribution.speakerName ?? t('unknownSpeaker')} · ${localizeText(contribution.subject.name, locale)}`;
    const description = `${t('summary')}: ${compactMetadataDescription(localizeText(stripMarkdown(contribution.text), locale))}`;
    const image = `${base}/api/og/contribution?${new URLSearchParams({ id: contribution.id, locale })}`;
    return { title, description, openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }] }, twitter: { card: 'summary_large_image', title, description, images: [image] } };
}
