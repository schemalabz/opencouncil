import About from "@/components/about/AboutPage"
import { Metadata } from "next"
import { getTranslations } from 'next-intl/server'
import { env } from '@/env.mjs'
import { getSupportedCitiesWithLogosCached, getAboutPageStatsCached, getGitHubStatsCached } from '@/lib/cache/queries'

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('about.metadata')

    const title = t('title')
    const description = t('description')
    const keywords = t('keywords').split(',')

    const ogImageUrl = `${env.NEXTAUTH_URL}/api/og?pageType=about`;

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
        alternates: {
            canonical: '/about',
        },
        other: {
            'about:mission': 'transparency',
            'about:technology': 'artificial-intelligence',
            'about:focus': 'municipal-councils',
        }
    };
}

export default async function AboutPage() {
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
    return <About citiesWithLogos={citiesWithLogos} stats={stats} githubStats={githubStats} />
}
