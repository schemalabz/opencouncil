import React from "react"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { getRealm } from "@/lib/realm.server"
import { hasExplainPage } from "@/lib/explain/availability"
import { SearchCoverageNote } from "@/components/search/SearchCoverageNote"

export default async function Layout({
  children
}: {
  children: React.ReactNode,
  params: Promise<{ locale: string }>
}) {
  const realm = await getRealm();

  return (
    <div className="min-h-screen">
      <Header path={[]} noContainer={true} />
      <main id="main-content" className="min-h-[70vh]">
        {children}
      </main>
      {/* This group holds only /search, so the note belongs to every page in it.
          Move it into the page if that stops being true. */}
      {hasExplainPage(realm) && <SearchCoverageNote />}
      <Footer realm={realm} />
    </div>
  );
}
