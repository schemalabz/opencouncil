import "./globals.css"
import { Inter as FontSans } from "next/font/google"
import { cn } from "../lib/utils"
import React from "react"
import PlausibleProvider from 'next-plausible'
import { SessionProvider } from "next-auth/react"
import { NextIntlClientProvider } from "next-intl";
import { unstable_setRequestLocale, getMessages } from "next-intl/server";
import { Toaster } from "@/components/ui/toaster";
import { routing } from "@/i18n/routing";

const fontSans = FontSans({
    subsets: ["latin"],
    variable: "--font-sans",
})

export const metadata = {
    title: 'OpenCouncil',
    description: 'Ανοιχτή τοπική αυτοδιοίκηση',
    icons: {
        icon: '/favicon.ico',
    },
    metadataBase: new URL('https://opencouncil.gr'),
    openGraph: {
        title: 'OpenCouncil',
        description: 'Ανοιχτή τοπική αυτοδιοίκηση',
        type: 'website',
        url: 'https://opencouncil.gr',
        images: [
            {
                url: '/landing-screenshot.png',
                width: 500,
                height: 500,
                alt: 'OpenCouncil Logo',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'OpenCouncil',
        description: 'Ανοιχτή τοπική αυτοδιοίκηση',
        images: ['/landing-screenshot.png'],
    },
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
    unstable_setRequestLocale(locale);
    const messages = await getMessages();

    return (
        <html lang={locale} suppressHydrationWarning>
            <body
                className={cn(
                    "min-h-screen bg-background font-sans antialiased",
                    fontSans.variable
                )}
            >
                <SessionProvider>
                    <PlausibleProvider domain="opencouncil.gr">
                        <NextIntlClientProvider locale={locale} messages={messages}>
                            {children}
                            <Toaster />
                        </NextIntlClientProvider>
                    </PlausibleProvider>
                </SessionProvider>
            </body>
        </html>
    );
}
