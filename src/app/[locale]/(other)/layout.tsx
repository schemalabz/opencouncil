import React from "react"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { getRealm } from "@/lib/realm.server";

export default async function Layout(
  props: {
    children: React.ReactNode,
    params: Promise<{ locale: string }>
  }
) {
  const { children } = props;

  return (
    <div className="min-h-screen">
      <Header path={[]} />
      <main id="main-content" className="min-h-[70vh] mt-[65px]">
        {children}
      </main>
      <Footer realm={await getRealm()} />
    </div>
  );
}
