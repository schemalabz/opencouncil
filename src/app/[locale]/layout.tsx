import { setRequestLocale } from "next-intl/server";
import { getMessages } from "next-intl/server";

import { routing } from '@/i18n/routing';
import { getGreekFallback } from '@/i18n/request';
import { notFound } from "next/navigation";
import { Toaster } from "@/components/ui/toaster";
import { IntlProvider } from "@/components/providers/IntlProvider";

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
    
    // Load Greek messages for fallback (Greek is the primary language)
    // Uses cached version from request.ts to avoid re-importing on every request
    const greekMessages = locale === 'el' 
        ? messages 
        : await getGreekFallback();

    return (
        <IntlProvider 
            locale={locale} 
            messages={messages}
            greekMessages={greekMessages}
        >
            {children}

            <Toaster />
            {QuickLogin && <QuickLogin />}
            {MobilePreviewReporter && <MobilePreviewReporter />}
        </IntlProvider>
    );
}
