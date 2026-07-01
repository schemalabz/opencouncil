import About from "@/components/about/AboutPage"
import { Metadata } from "next"
import { getTranslations } from 'next-intl/server'
import { getSupportedCitiesWithLogosCached, getAboutPageStatsCached, getGitHubStatsCached } from '@/lib/cache/queries'
import { buildHreflangAlternates } from '@/lib/utils/hreflang'
import { getRealm } from '@/lib/realm.server'

export async function generateMetadata(
    props: {
        params: Promise<{ locale: string }>
    }
): Promise<Metadata> {
    const params = await props.params;

    const {
        locale
    } = params;

    const t = await getTranslations('about.metadata')

    const title = t('title')
    const description = t('description')
    const keywords = t('keywords').split(',')

    const ogImageUrl = `/api/og?pageType=about`;

    return {
        title,
        description,
        keywords,
        authors: [{ name: 'OpenCouncil Team' }],
        openGraph: {
            title,
            description,
            type: 'website',
            siteName: 'OpenCouncil',
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: title,
                }
            ],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: [ogImageUrl],
            creator: '@opencouncil',
            site: '@opencouncil'
        },
        alternates: await buildHreflangAlternates('/about', locale),
        other: {
            'about:mission': 'transparency',
            'about:technology': 'artificial-intelligence',
            'about:focus': 'municipal-councils',
        }
    };
}

export default async function AboutPage() {
    const realm = await getRealm();
    // On the French realm (opencouncil.fr, any locale) we hide pricing.
    const hidePricing = realm === 'france';
    const [citiesWithLogos, stats, githubStats] = await Promise.all([
        getSupportedCitiesWithLogosCached().catch(error => {
            console.error('Failed to fetch cities with logos:', error);
            return [];
        }),
        getAboutPageStatsCached().catch(error => {
            console.error('Failed to fetch about page stats:', error);
            return null;
        }),
        getGitHubStatsCached().catch(error => {
            console.error('Failed to fetch GitHub stats:', error);
            return null;
        }),
    ]);
    return <About citiesWithLogos={citiesWithLogos} stats={stats} githubStats={githubStats} hidePricing={hidePricing} realm={realm} />
}
