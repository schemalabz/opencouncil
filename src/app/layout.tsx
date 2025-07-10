import "./globals.css"
import { Inter as FontSans } from "next/font/google"
import { cn } from "../lib/utils"
import React from "react"
import PlausibleProvider from 'next-plausible'
import { SessionProvider } from "next-auth/react"
import { Toaster } from "@/components/ui/toaster";
import { routing } from "@/i18n/routing";
import { env } from "@/env.mjs";

// Keep Inter as a fallback font
const fontSans = FontSans({
    subsets: ["latin"],
    variable: "--font-sans",
})

export const metadata = {
    title: {
        default: 'OpenCouncil - Ανοιχτή Τοπική Αυτοδιοίκηση',
        template: '%s | OpenCouncil'
    },
    description: 'Το OpenCouncil χρησιμοποιεί τεχνητή νοημοσύνη για να παρακολουθεί τα δημοτικά συμβούλια και να τα κάνει απλά και κατανοητά. Δείτε συνεδριάσεις, θέματα και αποφάσεις των δημοτικών συμβουλίων σε όλη την Ελλάδα.',
    keywords: [
        'δημοτικά συμβούλια',
        'τοπική αυτοδιοίκηση',
        'διαφάνεια',
        'δημοκρατία',
        'τεχνητή νοημοσύνη',
        'δημόσια διοίκηση',
        'πολίτες',
        'συμμετοχή',
        'Ελλάδα'
    ],
    authors: [{ name: 'OpenCouncil', url: 'https://opencouncil.gr' }],
    creator: 'Schema Labs',
    publisher: 'OpenCouncil',
    formatDetection: {
        email: false,
        address: false,
        telephone: false,
    },
    icons: {
        icon: [
            { url: '/favicon.ico' },
            { url: '/logo.png', sizes: '32x32', type: 'image/png' },
        ],
        apple: [
            { url: '/logo.png' },
        ],
    },
    metadataBase: new URL(env.NEXT_PUBLIC_BASE_URL),
    alternates: {
        canonical: '/',
        languages: {
            'el': '/',
            'en': '/en',
        },
    },
    openGraph: {
        type: 'website',
        siteName: 'OpenCouncil',
        title: 'OpenCouncil - Ανοιχτή Τοπική Αυτοδιοίκηση',
        description: 'Το OpenCouncil χρησιμοποιεί τεχνητή νοημοσύνη για να παρακολουθεί τα δημοτικά συμβούλια και να τα κάνει απλά και κατανοητά.',
        url: env.NEXT_PUBLIC_BASE_URL,
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
        title: 'OpenCouncil - Ανοιχτή Τοπική Αυτοδιοίκηση',
        description: 'Το OpenCouncil χρησιμοποιεί τεχνητή νοημοσύνη για να παρακολουθεί τα δημοτικά συμβούλια και να τα κάνει απλά και κατανοητά.',
        images: ['/landing-screenshot.png'],
        creator: '@opencouncil_gr',
        site: '@opencouncil_gr',
    },
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
    verification: {
        google: undefined, // Add Google Search Console verification if available
    },
    category: 'Government & Politics',
    other: {
        'application-name': 'OpenCouncil',
        'msapplication-TileColor': '#ffffff',
        'theme-color': '#ffffff',
    },
}

export const viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    themeColor: '#ffffff',
    colorScheme: 'light dark',
}

export function generateStaticParams() {
    return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
    children,
    params: { locale }
}: {
    children: React.ReactNode,
    params: { locale: string }
}) {

    return (
        <html lang={locale} suppressHydrationWarning>
            <head>
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            '@context': 'https://schema.org',
                            '@type': 'Organization',
                            name: 'OpenCouncil',
                            description: 'Πλατφόρμα ανοιχτής τοπικής αυτοδιοίκησης με χρήση τεχνητής νοημοσύνης',
                            url: env.NEXT_PUBLIC_BASE_URL,
                            logo: `${env.NEXT_PUBLIC_BASE_URL}/logo.png`,
                            sameAs: [
                                'https://twitter.com/opencouncil_gr',
                                'https://schemalabs.substack.com',
                            ],
                            foundingDate: '2024',
                            founder: {
                                '@type': 'Organization',
                                name: 'Schema Labs',
                                url: 'https://schemalabs.gr'
                            },
                            areaServed: {
                                '@type': 'Country',
                                name: 'Greece',
                                alternateName: 'Ελλάδα'
                            },
                            applicationCategory: 'GovernmentApplication',
                            operatingSystem: 'Web',
                        })
                    }}
                />
            </head>
            <body
                className={cn(
                    "min-h-screen bg-background font-sans antialiased",
                    fontSans.variable
                )}
            >
                <SessionProvider>
                    <PlausibleProvider domain="opencouncil.gr">
                        {children}
                        <Toaster />
                    </PlausibleProvider>
                </SessionProvider>
            </body>
        </html>
    );
}
