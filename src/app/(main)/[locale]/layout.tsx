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
      <div className="container mx-auto py-10 min-h-[70vh] mt-[65px]">
        {children}
      </div>
      <Footer />
      <Toaster />
    </NextIntlClientProvider>
  </>)
}