import React from "react"
import Header from "@/components/layout/Header"

export default async function MapLayout({
  children,
}: {
  children: React.ReactNode,
}) {

  return (
    <div className="fixed inset-0 overflow-hidden">
      <Header
        path={[]}
        className="absolute top-0 left-0 right-0 z-50 [&_.absolute.inset-0]:!hidden"
        noContainer={true}
      />
      <div className="absolute inset-0">
        {children}
      </div>
    </div>
  );
}

