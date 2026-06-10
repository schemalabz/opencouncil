import { setRequestLocale } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import { routing } from '@/i18n/routing';
import { notFound } from "next/navigation";
import { Toaster } from "@/components/ui/toaster";

// Only import in development or on preview deployments — excluded from real
// production bundles entirely. Both branches use literal `process.env.X === '...'`
// comparisons so the bundler can dead-code-eliminate QuickLogin when neither flag
// is set (i.e. real production).
const QuickLogin = process.env.NODE_ENV === 'development' || process.env.IS_PREVIEW === 'true'
    ? require("@/components/dev/QuickLogin").default
    : null;
const MobilePreviewReporter = process.env.NODE_ENV === 'development'
    ? require("@/components/dev/MobilePreviewReporter").default
    : null;

export function generateStaticParams() {
    return routing.locales.map((locale) => ({ locale }));
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
            {QuickLogin && <QuickLogin isPreview={process.env.IS_PREVIEW === 'true'} />}
            {MobilePreviewReporter && <MobilePreviewReporter />}
        </NextIntlClientProvider>
    );
}
