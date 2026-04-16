import { AdminSidebar } from "@/components/admin/sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { getCurrentUser } from "@/lib/auth"
import { redirect } from "next/navigation";
import React from "react"

export default async function Layout({ children }: { children: React.ReactNode }) {
    const user = await getCurrentUser();
    if (!user) redirect("/sign-in");
    if (!user.isSuperAdmin) {
        console.error(`Admin access denied for user ${user.email} (id: ${user.id}, isSuperAdmin: ${user.isSuperAdmin})`);
        redirect("/");
    }

    return <SidebarProvider>
        <AdminSidebar />
        {children}
    </SidebarProvider>
}