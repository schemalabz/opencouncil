import "./globals.css"
import { Inter as FontSans } from "next/font/google"
import { cn } from "../lib/utils"
import React from "react"
import PlausibleProvider from 'next-plausible'
import { SessionProvider } from "next-auth/react"

const fontSans = FontSans({
    subsets: ["latin"],
    variable: "--font-sans",
})

export const metadata = {
    title: 'OpenCouncil',
    description: 'Ανοιχτή τοπική αυτοδιοίκηση',
    icons: {
        icon: '/favicon.ico',
    },
    metadataBase: new URL('https://opencouncil.gr'),
    openGraph: {
        title: 'OpenCouncil',
        description: 'Ανοιχτή τοπική αυτοδιοίκηση',
        type: 'website',
        url: 'https://opencouncil.gr',
        images: [
            {
                url: '/square.png',
                width: 500,
                height: 500,
                alt: 'OpenCouncil Logo',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'OpenCouncil',
        description: 'Ανοιχτή τοπική αυτοδιοίκηση',
        images: ['/square.png'],
    },
}

type RootLayoutProps = {
    children: React.ReactNode
    params: { locale: string }
}

export default async function RootLayout({ children }: RootLayoutProps) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body
                className={cn(
                    "min-h-screen bg-background font-sans antialiased",
                    fontSans.variable
                )}
            >
                <SessionProvider>
                    <PlausibleProvider domain="opencouncil.gr">
                        {children}
                    </PlausibleProvider>
                </SessionProvider>
            </body>
        </html >
    )
}
