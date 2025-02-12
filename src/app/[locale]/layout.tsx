import { setRequestLocale } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import { routing } from '@/i18n/routing';
import { notFound } from "next/navigation";

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
        </NextIntlClientProvider>
    );
}
