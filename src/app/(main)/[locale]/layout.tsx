import React from "react"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Toaster } from "@/components/ui/toaster";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";


export default async function Layout({ children, params: { locale } }: { children: React.ReactNode, params: { locale: string } }) {
  const messages = await getMessages();
  return (<>
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Header />
      <div className="container mx-auto py-10">
        {children}
      </div >
      <Footer />
      <Toaster />
    </NextIntlClientProvider>
  </>)
}