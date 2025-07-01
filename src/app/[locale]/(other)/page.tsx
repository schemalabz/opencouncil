import { Metadata } from "next";
import { Landing } from "@/components/landing/landing";
import { LandingCity } from "@/lib/db/landing";
import { fetchLatestSubstackPostCached, getAllCitiesMinimalCached, getCouncilMeetingsForCityCached } from "@/lib/cache/queries";
import { env } from "@/env.mjs";

export const metadata: Metadata = {
    title: "OpenCouncil - Ανοιχτή Τοπική Αυτοδιοίκηση με Τεχνητή Νοημοσύνη",
    description: "Το OpenCouncil χρησιμοποιεί τεχνητή νοημοσύνη για να παρακολουθεί τα δημοτικά συμβούλια και να τα κάνει απλά και κατανοητά. Δείτε συνεδριάσεις, θέματα και αποφάσεις των δημοτικών συμβουλίων σε όλη την Ελλάδα.",
    keywords: [
        'δημοτικά συμβούλια',
        'τοπική αυτοδιοίκηση',
        'διαφάνεια',
        'δημοκρατία',
        'τεχνητή νοημοσύνη',
        'δημόσια διοίκηση',
        'πολίτες',
        'συμμετοχή',
        'Ελλάδα',
        'δημοτικές αποφάσεις',
        'πρακτικά συνεδριάσεων',
        'δημότες',
        'κοινότητα'
    ],
    openGraph: {
        title: "OpenCouncil - Ανοιχτή Τοπική Αυτοδιοίκηση",
        description: "Δείτε και παρακολουθήστε τα δημοτικά συμβούλια σε όλη την Ελλάδα. Τεχνητή νοημοσύνη κάνει την τοπική αυτοδιοίκηση πιο προσβάσιμη.",
        type: 'website',
        url: env.NEXT_PUBLIC_BASE_URL,
        siteName: 'OpenCouncil',
        locale: 'el_GR',
        alternateLocale: ['en_US'],
        images: [
            {
                url: '/landing-screenshot.png',
                width: 1200,
                height: 630,
                alt: 'OpenCouncil - Ανοιχτή Τοπική Αυτοδιοίκηση',
                type: 'image/png',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: "OpenCouncil - Ανοιχτή Τοπική Αυτοδιοίκηση",
        description: "Δείτε και παρακολουθήστε τα δημοτικά συμβούλια σε όλη την Ελλάδα. Τεχνητή νοημοσύνη κάνει την τοπική αυτοδιοίκηση πιο προσβάσιμη.",
        images: ['/landing-screenshot.png'],
        creator: '@opencouncil_gr',
        site: '@opencouncil_gr',
    },
    alternates: {
        canonical: "/",
        languages: {
            'el': '/',
            'en': '/en',
        },
    },
    category: 'Government & Politics',
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            'max-video-preview': -1,
            'max-image-preview': 'large',
            'max-snippet': -1,
        },
    },
};

export default async function HomePage({
    params: { locale }
}: {
    params: { locale: string }
}) {
    // Fetch all cities (minimal data) and substack post in parallel
    const [allCities, latestPost] = await Promise.all([
        getAllCitiesMinimalCached().catch(error => {
            console.error('Failed to fetch cities:', error);
            return [];
        }),
        fetchLatestSubstackPostCached()
    ]);

    // Only fetch meeting information for listed cities with official support
    const supportedCities = allCities.filter(city => city.officialSupport && city.isListed);
    
    // Fetch most recent meeting for supported cities in parallel to create citiesWithMeetings
    const citiesWithMeetings: LandingCity[] = await Promise.all(
        supportedCities.map(async city => {
            const meetings = await getCouncilMeetingsForCityCached(city.id, { limit: 1 });
            
            return {
                ...city,
                mostRecentMeeting: meetings[0]
            };
        })
    );


    return <Landing allCities={allCities} cities={citiesWithMeetings} latestPost={latestPost} />;
} 