"use server";
import { default as SearchPageComponent } from "@/components/search/SearchPage";
import { Suspense } from "react";
import { Metadata } from "next";
import { env } from '@/env.mjs';

export async function generateMetadata(): Promise<Metadata> {
    const description = "Αναζητήστε στα δημοτικά συμβούλια του OpenCouncil. Βρείτε αναφορές σε θέματα, τοποθετήσεις συμβούλων, στατιστικά και πολλά άλλα χρησιμοποιώντας την έξυπνη αναζήτηση του OpenCouncil.";

    const ogImageUrl = `${env.NEXT_PUBLIC_BASE_URL}/api/og?pageType=search`;

    return {
        title: "Αναζήτηση | OpenCouncil",
        description,
        keywords: [
            'αναζήτηση',
            'δημοτικά συμβούλια',
            'τοποθετήσεις',
            'θέματα',
            'στατιστικά',
            'δημοτικοί σύμβουλοι',
            'OpenCouncil',
            'έξυπνη αναζήτηση',
            'τοπική αυτοδιοίκηση'
        ],
        authors: [{ name: 'OpenCouncil' }],
        openGraph: {
            title: "Αναζήτηση | OpenCouncil",
            description,
            type: 'website',
            siteName: 'OpenCouncil',
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: "Αναζήτηση στα Δημοτικά Συμβούλια - OpenCouncil",
                }
            ],
            locale: 'el_GR',
        },
        twitter: {
            card: 'summary_large_image',
            title: "Αναζήτηση | OpenCouncil",
            description,
            images: [ogImageUrl],
            creator: '@opencouncil',
            site: '@opencouncil'
        },
        alternates: {
            canonical: '/search',
        },
        other: {
            'search:type': 'intelligent',
            'search:scope': 'municipal-councils',
            'search:features': 'transcripts,statistics,people',
        }
    };
}

export default async function SearchPage({ params: { locale } }: { params: { locale: string } }) {
    return <Suspense fallback={<div>Loading...</div>}>
        <SearchPageComponent />
    </Suspense>
}