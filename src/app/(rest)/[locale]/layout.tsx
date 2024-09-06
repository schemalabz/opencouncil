import React from "react"
import { getMessages } from "next-intl/server"
import Header from "@/components/layout/Header"

export default async function Layout({ children }: { children: React.ReactNode }) {
  return (<>
    <Header />
    <div className="container mx-auto py-10">
      {children}
    </div >
  </>)
}