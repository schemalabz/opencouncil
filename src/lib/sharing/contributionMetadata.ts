import 'server-only';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getMetadataBaseFromRequest } from '@/lib/realm.server';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { compactMetadataDescription } from '@/lib/seo/metadataDescription';
import { localizeText } from '@/lib/serbian';
import { shareCardMetadata } from '@/lib/sharing/shareCard';
import type { PublicContribution } from './contributions';
import { sharedSpeakerName } from './speakerName';

export async function contributionMetadata(contribution: PublicContribution, locale: string): Promise<Metadata> {
    const [t, tTranscript, base] = await Promise.all([getTranslations({ locale, namespace: 'sharing' }), getTranslations({ locale, namespace: 'transcript' }), getMetadataBaseFromRequest()]);
    const speaker = sharedSpeakerName(contribution.speakerName, contribution.speakerUnverified, { unknownSpeaker: t('unknownSpeaker'), unverified: tTranscript('unverifiedSpeaker.label') });
    const title = `${speaker} · ${localizeText(contribution.subject.name, locale)}`;
    const description = `${t('summary')}: ${compactMetadataDescription(localizeText(stripMarkdown(contribution.text), locale))}`;
    const image = `${base}/api/og/contribution?${new URLSearchParams({ id: contribution.id, locale })}`;
    return shareCardMetadata({ title, description, image });
}
