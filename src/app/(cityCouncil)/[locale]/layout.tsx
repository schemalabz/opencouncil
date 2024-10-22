import React from "react"
import { NextIntlClientProvider } from "next-intl";
import { getMessages, unstable_setRequestLocale } from "next-intl/server";
import { Toaster } from "@/components/ui/toaster";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
    return routing.locales.map((locale) => ({ locale }));
}



export default async function Layout({ children, params }: { children: React.ReactNode, params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    unstable_setRequestLocale(locale);
    const messages = await getMessages();
    return <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
        <Toaster />
    </NextIntlClientProvider>;
}