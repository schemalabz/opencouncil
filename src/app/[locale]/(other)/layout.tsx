import React from "react"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Toaster } from "@/components/ui/toaster";

export default async function Layout({
  children,
  params: { locale }
}: {
  children: React.ReactNode,
  params: { locale: string }
}) {

  return (
    <>
      <Header path={[]} />
      <main className="min-h-[70vh] mt-[65px]">
        {children}
      </main>
      <Footer />
      <Toaster />
    </>
  );
}