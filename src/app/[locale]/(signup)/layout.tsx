import React from "react"
import Header from "@/components/layout/Header"
import { getRealm } from "@/lib/realm.server";
import { hasExplainPage } from "@/lib/explain/availability";

/**
 * The municipality pickers of the two signup flows, without the site
 * footer: the list is the page, and nothing should scroll below it.
 */
export default async function Layout(
  props: {
    children: React.ReactNode,
    params: Promise<{ locale: string }>
  }
) {
  const { children } = props;
  const realm = await getRealm();

  return (
    <div className="min-h-screen">
      <Header path={[]} showExplain={hasExplainPage(realm)} />
      <main id="main-content" className="min-h-[70vh]">
        {children}
      </main>
    </div>
  );
}
