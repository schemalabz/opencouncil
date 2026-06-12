import React from "react"
import Header from "@/components/layout/Header"

export default async function MapLayout({
  children,
}: {
  children: React.ReactNode,
}) {

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <Header
        path={[]}
        className="relative z-50 shrink-0 border-b border-border bg-background"
        noContainer={true}
      />
      <div className="min-h-0 flex-1">
        {children}
      </div>
    </div>
  );
}
