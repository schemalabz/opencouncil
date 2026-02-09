import About from "@/components/static/About"
import { Metadata } from "next"
import { env } from '@/env.mjs'
import { getSupportedCitiesWithLogosCached } from '@/lib/cache/queries'

export async function generateMetadata(): Promise<Metadata> {
    const description = "Το OpenCouncil χρησιμοποιεί τεχνητή νοημοσύνη για να παρακολουθεί τα δημοτικά συμβούλια και να τα κάνει απλά και κατανοητά. Μάθετε περισσότερα για την αποστολή μας, την τεχνολογία μας και την ομάδα μας.";

    const ogImageUrl = `${env.NEXTAUTH_URL}/api/og?pageType=about`;

    return {
        title: "Σχετικά με το OpenCouncil | Διαφάνεια στα Δημοτικά Συμβούλια",
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
            title: "Σχετικά με το OpenCouncil",
            description,
            type: 'website',
            siteName: 'OpenCouncil',
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: "OpenCouncil - Διαφάνεια στα Δημοτικά Συμβούλια",
                }
            ],
            locale: 'el_GR',
        },
        twitter: {
            card: 'summary_large_image',
            title: "Σχετικά με το OpenCouncil",
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
    const citiesWithLogos = await getSupportedCitiesWithLogosCached().catch(error => {
        console.error('Failed to fetch cities with logos:', error);
        return [];
    });
    return <About citiesWithLogos={citiesWithLogos} />
}