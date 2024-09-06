import "./styles/globals.css"
import { Inter as FontSans } from "next/font/google"
import { cn } from "../lib/utils"
import React from "react"

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

export default async function RootLayout({ children }: RootLayoutProps) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body
                className={cn(
                    "min-h-screen bg-background font-sans antialiased",
                    fontSans.variable
                )}
            >
                {children}

            </body>
        </html >
    )
}
