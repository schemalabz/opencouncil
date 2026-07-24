import "./globals.css"
import { cn } from "../lib/utils"
import React, { Suspense } from "react"
import PlausibleAnalytics from "@/components/analytics/PlausibleAnalytics"
import PostHogPageView from "@/components/analytics/PostHogPageView"
import PostHogAuthSync from "@/components/analytics/PostHogAuthSync"
import { SessionProvider } from "next-auth/react"
import { Toaster } from "@/components/ui/toaster";
import { inter, roboto, robotoMono } from "@/lib/fonts";
import { routing, LOCALE_OVERRIDE_HEADER } from "@/i18n/routing";
import { getLocale, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { Metadata } from "next";
import { getRealmBaseUrlFromRequest } from "@/lib/realm.server";

export async function generateMetadata(): Promise<Metadata> {
    // metadataBase is the realm's canonical domain (resolved from the request
    // Host), so opencouncil.gr and opencouncil.fr each resolve their own
    // relative OG-image / canonical URLs. Child pages set relative `/api/og`
    // image URLs that get resolved against this base per host.
    const baseUrl = await getRealmBaseUrlFromRequest();

    return {
        title: 'OpenCouncil',
        description: 'Ανοιχτή τοπική αυτοδιοίκηση',
        icons: {
            icon: '/favicon.ico',
        },
        metadataBase: new URL(baseUrl),
        openGraph: {
            title: 'OpenCouncil',
            description: 'Ανοιχτή τοπική αυτοδιοίκηση',
            type: 'website',
            url: baseUrl,
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
    };
}

export const viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    // The app has no dark theme — `darkMode: ["class"]` is configured but the class is never
    // applied. Without a declared color scheme, Chrome's Auto Dark Theme (and Samsung Internet,
    // and in-app WebViews) assume the page simply hasn't been updated and algorithmically invert
    // it, which darkens some surfaces and not others. `only light` is the documented opt-out.
    colorScheme: 'only light',
}

export default async function RootLayout(
    props: {
        children: React.ReactNode,
    }
) {
    const { children } = props;

    // The root layout sits above the [locale] segment, so it doesn't receive a
    // locale param from routing. For `.fr`-host requests (which bypass next-intl's
    // middleware) the proxy passes the locale via LOCALE_OVERRIDE_HEADER; for
    // everything else getLocale() resolves it normally. This drives the <html lang>
    // attr and the skip-to-content string; per-page strings come from the [locale]
    // layout's NextIntlClientProvider.
    const overrideLocale = (await headers()).get(LOCALE_OVERRIDE_HEADER);
    const locale = overrideLocale && routing.locales.includes(overrideLocale as typeof routing.locales[number])
        ? overrideLocale
        : await getLocale();
    const t = await getTranslations({ locale, namespace: "Common" });

    return (
        <html lang={locale} suppressHydrationWarning>
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
                    <PlausibleAnalytics>
                        {children}
                        <Toaster />
                    </PlausibleAnalytics>
                    {/* useSearchParams requires a Suspense boundary in layouts */}
                    <Suspense fallback={null}>
                        <PostHogPageView />
                    </Suspense>
                    <PostHogAuthSync />
                </SessionProvider>
            </body>
        </html>
    );
}
