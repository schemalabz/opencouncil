import React from "react"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Toaster } from "@/components/ui/toaster";

const Banner = () => {
  return (
    <div className="bg-black text-white p-2">
      <p className="text-center">To OpenCouncil συμμετέχει στις σημερινές κινητοποιήσεις για τα Τέμπη.</p>
    </div>
  )
}

export default async function Layout({
  children,
  params: { locale }
}: {
  children: React.ReactNode,
  params: { locale: string }
}) {

  return (
    <>
      <Banner />
      <Header path={[]} />
      <main className="min-h-[70vh] mt-[65px]">
        {children}
      </main>
      <Footer />
    </>
  );
}