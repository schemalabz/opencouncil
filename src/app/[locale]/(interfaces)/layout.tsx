import React from "react"
import Header from "@/components/layout/Header"

export default async function Layout({
  children
}: {
  children: React.ReactNode,
  params: Promise<{ locale: string }>
}) {

  return (
    <div className="min-h-screen">
      <Header path={[]} noContainer={true} />
      <main id="main-content" className="min-h-[70vh]">
        {children}
      </main>
    </div>
  );
}
