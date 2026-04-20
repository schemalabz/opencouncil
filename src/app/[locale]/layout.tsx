import { setRequestLocale } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { headers } from "next/headers";
import type { Metadata } from "next";

import { routing } from '@/i18n/routing';
import { notFound } from "next/navigation";
import { Toaster } from "@/components/ui/toaster";
import { buildHreflangAlternates } from "@/lib/utils/hreflang";

// Only import in development — excluded from production bundles entirely
const QuickLogin = process.env.NODE_ENV === 'development'
    ? require("@/components/dev/QuickLogin").default
    : null;
const MobilePreviewReporter = process.env.NODE_ENV === 'development'
    ? require("@/components/dev/MobilePreviewReporter").default
    : null;

export function generateStaticParams() {
    return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
    const pathname = headers().get('x-pathname') ?? '/';
    // Strip /en prefix so canonical always points to the Greek (default) path
    const canonicalPath = locale === 'en' && pathname.startsWith('/en')
        ? pathname.slice(3) || '/'
        : pathname;
    return { alternates: buildHreflangAlternates(canonicalPath) };
}

export default async function LocaleLayout({
    children,
    params: { locale }
}: {
    children: React.ReactNode,
    params: { locale: string }
}) {
    if (!routing.locales.includes(locale as any)) {
        notFound();
    }
    setRequestLocale(locale);

    const messages = await getMessages();

    return (
        <NextIntlClientProvider locale={locale} messages={messages}>
            {children}

            <Toaster />
            {QuickLogin && <QuickLogin />}
            {MobilePreviewReporter && <MobilePreviewReporter />}
        </NextIntlClientProvider>
    );
}
