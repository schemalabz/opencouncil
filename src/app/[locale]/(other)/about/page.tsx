import { Metadata } from "next";
import { notFound } from "next/navigation"
import About from "@/components/static/About"
import { env } from "@/env.mjs";

export const metadata: Metadata = {
    title: "Σχετικά με το OpenCouncil",
    description: "Μάθετε περισσότερα για το OpenCouncil - την πλατφόρμα που κάνει την τοπική αυτοδιοίκηση πιο διαφανή και προσβάσιμη μέσω τεχνητής νοημοσύνης. Δημιουργήθηκε από τη Schema Labs για την ενίσχυση της δημοκρατίας.",
    keywords: [
        'OpenCouncil',
        'σχετικά',
        'Schema Labs',
        'τοπική αυτοδιοίκηση',
        'διαφάνεια',
        'τεχνητή νοημοσύνη',
        'δημοκρατία',
        'μη κερδοσκοπικός οργανισμός'
    ],
    openGraph: {
        title: "Σχετικά με το OpenCouncil",
        description: "Μάθετε περισσότερα για το OpenCouncil - την πλατφόρμα που κάνει την τοπική αυτοδιοίκηση πιο διαφανή και προσβάσιμη.",
        type: 'website',
        url: `${env.NEXT_PUBLIC_BASE_URL}/about`,
        images: [
            {
                url: '/landing-screenshot.png',
                width: 1200,
                height: 630,
                alt: 'OpenCouncil - Σχετικά με εμάς',
            }
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: "Σχετικά με το OpenCouncil",
        description: "Μάθετε περισσότερα για το OpenCouncil - την πλατφόρμα που κάνει την τοπική αυτοδιοίκηση πιο διαφανή και προσβάσιμη.",
        images: ['/landing-screenshot.png'],
    },
    alternates: {
        canonical: "/about",
        languages: {
            'el': '/about',
            'en': '/en/about',
        },
    },
};

export default function AboutPage() {
    return <About />
}