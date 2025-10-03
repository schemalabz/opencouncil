import React from "react"
import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Toaster } from "@/components/ui/toaster";
import dynamic from 'next/dynamic';

// Import Aurora with dynamic loading to prevent SSR issues with canvas
const Aurora = dynamic(() => import('@/components/landing/aurora'), { ssr: false });

export default async function Layout({
  children
}: {
  children: React.ReactNode,
  params: { locale: string }
}) {

  return (
    <>
      <div className="relative overflow-hidden min-h-screen">
        {/* Aurora at the very top of the page - absolute position to scroll with content */}
        <div className="absolute top-0 left-0 w-full h-screen z-0" style={{ pointerEvents: 'auto' }}>
          <Aurora className="w-full h-full" />
        </div>

        <Header path={[]} className="relative z-10" noContainer={true} />
        <main className="min-h-[70vh] relative z-5">
          {children}
        </main>
      </div>
    </>
  );
}