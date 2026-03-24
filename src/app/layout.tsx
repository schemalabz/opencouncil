import "./globals.css"
import { cn } from "../lib/utils"
import React from "react"
import PlausibleProvider from 'next-plausible'
import { SessionProvider } from "next-auth/react"
import { Toaster } from "@/components/ui/toaster";
import { routing } from "@/i18n/routing";
import { inter, roboto, robotoMono } from "@/lib/fonts";
import { getTranslations } from "next-intl/server";

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
                url: '/oc-theme.png',
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
        images: ['/oc-theme.png'],
    },
}

export const viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
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

    const t = await getTranslations({ locale: locale || routing.defaultLocale, namespace: "Common" });

    return (
        <html lang={locale || routing.defaultLocale} suppressHydrationWarning>
            <head>
            </head>
            <body
                className={cn(
                    "min-h-screen bg-background font-sans antialiased",
                    inter.variable,
                    roboto.variable,
                    robotoMono.variable
                )}
            >
                <a
                    href="#main-content"
                    className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none"
                >
                    {t("skipToContent")}
                </a>
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
