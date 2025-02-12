import { AdminSidebar } from "@/components/admin/sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { getCurrentUser, withUserAuthorizedToEdit } from "@/lib/auth"
import { redirect } from "next/navigation";
import React from "react"

export default async function Layout({ children }: { children: React.ReactNode }) {
    const user = await getCurrentUser();
    if (!user) redirect("/sign-in");
    await withUserAuthorizedToEdit({});

    return <SidebarProvider>
        <AdminSidebar />
        {children}
    </SidebarProvider>
}