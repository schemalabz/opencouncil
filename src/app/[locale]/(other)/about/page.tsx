import About from "@/components/about/AboutPage"
import { Metadata } from "next"
import { env } from '@/env.mjs'
import { getSupportedCitiesWithLogosCached, getAboutPageStatsCached, getGitHubStatsCached } from '@/lib/cache/queries'

export async function generateMetadata(): Promise<Metadata> {
    const description = "Δημοτικά συμβούλια, επιτροπές και κοινότητες — πιο ανοιχτά για τους δημότες, πιο αποδοτικά για τις υπηρεσίες. Σε 10 δήμους στην Ελλάδα.";

    const ogImageUrl = `${env.NEXTAUTH_URL}/api/og?pageType=about`;

    return {
        title: "OpenCouncil — Το λειτουργικό σύστημα των συλλογικών οργάνων",
        description,
        keywords: [
            'OpenCouncil',
            'τεχνητή νοημοσύνη',
            'δημοτικά συμβούλια',
            'διαφάνεια',
            'δημοκρατία',
            'τοπική αυτοδιοίκηση',
            'αυτοματοποίηση',
            'πολιτική συμμετοχή',
            'πολίτες'
        ],
        authors: [{ name: 'OpenCouncil Team' }],
        openGraph: {
            title: "OpenCouncil — Το λειτουργικό σύστημα των συλλογικών οργάνων",
            description,
            type: 'website',
            siteName: 'OpenCouncil',
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: "OpenCouncil — Το λειτουργικό σύστημα των συλλογικών οργάνων",
                }
            ],
            locale: 'el_GR',
        },
        twitter: {
            card: 'summary_large_image',
            title: "OpenCouncil — Το λειτουργικό σύστημα των συλλογικών οργάνων",
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