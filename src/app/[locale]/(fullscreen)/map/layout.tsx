import React from "react"
import { MapHeaderProvider } from "@/components/map/MapHeaderContext"
import { MapPageHeader } from "@/components/map/MapPageHeader"

export default async function MapLayout({
  children,
}: {
  children: React.ReactNode,
}) {

  return (
    <MapHeaderProvider>
      <div className="fixed inset-0 flex flex-col overflow-hidden">
        <MapPageHeader />
        <div className="min-h-0 flex-1">
          {children}
        </div>
      </div>
    </MapHeaderProvider>
  );
}
