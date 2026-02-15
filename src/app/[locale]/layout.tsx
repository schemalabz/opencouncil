import { setRequestLocale } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import { routing } from '@/i18n/routing';
import { notFound } from "next/navigation";
import { Toaster } from "@/components/ui/toaster";
import QuickLogin from "@/components/dev/QuickLogin";

// Only import in development — excluded from production bundles entirely
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
            <QuickLogin />
            {MobilePreviewReporter && <MobilePreviewReporter />}
        </NextIntlClientProvider>
    );
}
