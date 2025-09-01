import { ChatInterface } from "@/components/chat/ChatInterface";
import { Suspense } from "react";
import { Metadata } from "next";
import { env } from '@/env.mjs';

export const metadata: Metadata = {
    title: "OpenCouncil AI | Συνομιλήστε για τα Δημοτικά Συμβούλια",
    description: "Συνομιλήστε με την τεχνητή νοημοσύνη του OpenCouncil για να μάθετε για δημοτικά συμβούλια, θέματα πολιτικής και την τοπική αυτοδιοίκηση. Κάντε ερωτήσεις και λάβετε εξατομικευμένες απαντήσεις.",
    keywords: [
        'OpenCouncil AI',
        'τεχνητή νοημοσύνη',
        'chatbot',
        'δημοτικά συμβούλια',
        'πολιτική',
        'τοπική αυτοδιοίκηση',
        'ερωτήσεις',
        'απαντήσεις',
        'διαδραστικότητα'
    ],
    authors: [{ name: 'OpenCouncil' }],
    openGraph: {
        title: "OpenCouncil AI",
        description: "Συνομιλήστε με την τεχνητή νοημοσύνη για να μάθετε για δημοτικά συμβούλια και θέματα πολιτικής",
        type: 'website',
        siteName: 'OpenCouncil',
        images: [
            {
                url: `${env.NEXT_PUBLIC_BASE_URL}/api/og?pageType=chat`,
                width: 1200,
                height: 630,
                alt: "OpenCouncil AI - Συνομιλήστε για τα Δημοτικά Συμβούλια",
            }
        ],
        locale: 'el_GR',
    },
    twitter: {
        card: 'summary_large_image',
        title: "OpenCouncil AI",
        description: "Συνομιλήστε με την τεχνητή νοημοσύνη για να μάθετε για δημοτικά συμβούλια και θέματα πολιτικής",
        images: [`${env.NEXT_PUBLIC_BASE_URL}/api/og?pageType=chat`],
        creator: '@opencouncil',
        site: '@opencouncil'
    },
    alternates: {
        canonical: '/chat',
    },
    other: {
        'chat:type': 'ai-assistant',
        'chat:domain': 'municipal-politics',
        'chat:interactive': 'true',
    }
};

export default function ChatPage() {
    return <Suspense fallback={<div>Loading...</div>}>
        <ChatInterface />
    </Suspense>

} 