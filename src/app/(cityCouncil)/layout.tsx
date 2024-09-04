import "../styles/globals.css"
import { Inter as FontSans } from "next/font/google"
import { cn } from "../../lib/utils"
import Header from "../../components/layout/Header"
import Footer from "../..//components/layout/Footer"
import React from "react"
import { getMessages } from "next-intl/server"
import { NextIntlClientProvider } from "next-intl"
import { ToastProvider } from "@/components/ui/toast"


const fontSans = FontSans({
    subsets: ["latin"],
    variable: "--font-sans",
})

export const metadata = {
    title: 'OpenCouncil',
    description: 'Making city council meetings useful',
    icons: {
        icon: '/favicon.ico',
    },
}

type RootLayoutProps = {
    children: React.ReactNode
    params: { locale: string }
}

export default async function RootLayout({ children, params: { locale } }: RootLayoutProps) {
    const messages = await getMessages()
    return (
        <html lang="en" suppressHydrationWarning>
            <head />
            <body
                className={cn(
                    "min-h-screen bg-background font-sans antialiased",
                    fontSans.variable
                )}
            >
                <NextIntlClientProvider messages={messages}>
                    <ToastProvider>
                        {children}
                        <Footer />
                    </ToastProvider>
                </NextIntlClientProvider>

            </body>
        </html>
    )
}
