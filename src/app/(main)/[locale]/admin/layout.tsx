import { AdminSidebar } from "@/components/admin/sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import React from "react"

export default async function Layout({ children }: { children: React.ReactNode }) {
    return <SidebarProvider>
        <AdminSidebar />
        {children}
    </SidebarProvider>
}