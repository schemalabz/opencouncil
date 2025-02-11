import React from "react"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Toaster } from "@/components/ui/toaster";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, unstable_setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { SessionProvider } from "next-auth/react";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function Layout({ children, params: { locale } }: { children: React.ReactNode, params: { locale: string } }) {
  unstable_setRequestLocale(locale);
  const messages = await getMessages();
  return (<>
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Header />
      <main className="min-h-[70vh] mt-[65px]">
        {children}
      </main>
      <Footer />
      <Toaster />
    </NextIntlClientProvider>
  </>)
}