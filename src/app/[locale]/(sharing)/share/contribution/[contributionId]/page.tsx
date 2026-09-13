import type { Metadata } from 'next';
import { cache } from 'react';
import { getTranslations } from 'next-intl/server';
import { getRealm } from '@/lib/realm.server';
import { getPublicContribution } from '@/lib/sharing/contributions';
import { contributionMetadata } from '@/lib/sharing/contributionMetadata';
import { redirect } from 'next/navigation';
import { ShareUnavailable } from '@/components/sharing/SharePageShell';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
interface Props { params: Promise<{ locale: string; contributionId: string }> }
const resolve = cache(async (id: string, locale: string) => getPublicContribution(id, await getRealm(), locale));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { locale, contributionId } = await params;
    const [contribution, t] = await Promise.all([resolve(contributionId, locale), getTranslations({ locale, namespace: 'sharing' })]);
    if (!contribution) return { title: t('unavailableTitle'), robots: { index: false, follow: false }, openGraph: { images: [] }, twitter: { images: [] } };
    return { ...await contributionMetadata(contribution, locale), robots: { index: false, follow: true } };
}

export default async function ContributionPage({ params }: Props) {
    const { locale, contributionId } = await params;
    const contribution = await resolve(contributionId, locale);
    if (contribution) redirect(contribution.subjectUrl);
    return <ShareUnavailable locale={locale} />;
}
