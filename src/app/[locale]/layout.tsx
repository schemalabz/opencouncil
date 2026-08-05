import { setRequestLocale } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import { routing } from '@/i18n/routing';
import { notFound } from "next/navigation";
import { Toaster } from "@/components/ui/toaster";
import ConsentChip from "@/components/analytics/ConsentChip";
import { env } from "@/env.mjs";

// Dev-only UI. MobilePreviewReporter's literal NODE_ENV comparison lets the
// bundler drop it from production builds; QuickLogin must instead be gated at
// runtime on the server, because previews run production builds and only
// declare themselves via DEPLOYMENT_ENV — it ships in the bundle but is never
// rendered on staging or real production.
const QuickLogin = process.env.NODE_ENV === 'development' || env.DEPLOYMENT_ENV === 'preview'
    ? require("@/components/dev/QuickLogin").default
    : null;
const MobilePreviewReporter = process.env.NODE_ENV === 'development'
    ? require("@/components/dev/MobilePreviewReporter").default
    : null;

export function generateStaticParams() {
    return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout(
    props: {
        children: React.ReactNode,
        params: Promise<{ locale: string }>
    }
) {
    const params = await props.params;

    const {
        locale
    } = params;

    const {
        children
    } = props;

    if (!routing.locales.includes(locale as any)) {
        notFound();
    }
    setRequestLocale(locale);

    const messages = await getMessages();

    return (
        <NextIntlClientProvider locale={locale} messages={messages}>
            {children}

            <Toaster />
            <ConsentChip />
            {QuickLogin && <QuickLogin isPreview={env.DEPLOYMENT_ENV === 'preview'} />}
            {MobilePreviewReporter && <MobilePreviewReporter />}
        </NextIntlClientProvider>
    );
}
