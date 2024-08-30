import "./styles/globals.css"
import { Inter as FontSans } from "next/font/google"

import { cn } from "@/lib/utils"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"

const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
})

export const metadata = {
  title: 'Townhalls',
  description: 'Making city council meetings useful',
  icons: {
    icon: '/favicon.ico',
  },
}

type RootLayoutProps = {
  children: React.ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          fontSans.variable
        )}
      >
        <Header />
        <div className="container mx-auto py-10">
          {children}
        </div >
        <Footer />
      </body>
    </html>
  )
}
