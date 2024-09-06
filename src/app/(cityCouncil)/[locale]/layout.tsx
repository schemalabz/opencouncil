import React from "react"
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { Toaster } from "@/components/ui/toaster";

export default async function Layout({ children, params: { locale } }: { children: React.ReactNode, params: { locale: string } }) {
    const messages = await getMessages();
    return <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
        <Toaster />
    </NextIntlClientProvider>;
}