import { AdminSidebar } from "@/components/admin/sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import Header from "@/components/layout/Header"
import { getCurrentUser, withUserAuthorizedToEdit } from "@/lib/auth"
import { redirect } from "next/navigation";
import React from "react"
import { Metadata } from "next"

// Auth-gated admin tree — nothing to index; covers every /admin/* page.
export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

export default async function Layout({ children }: { children: React.ReactNode }) {
    const user = await getCurrentUser();
    if (!user) redirect("/sign-in");
    await withUserAuthorizedToEdit({});

    return (
        <SidebarProvider>
            {/* The nav owns the left column top to bottom, so its edge is the
                page's one vertical rule and the header sits beside it. */}
            <div className="h-screen w-full flex overflow-hidden">
                <AdminSidebar />
                <div className="flex min-w-0 flex-1 flex-col">
                    <Header
                        path={[{ name: "Admin", link: "/admin" }]}
                        showSidebarTrigger={true}
                        inset={true}
                        noContainer={true}
                        className="relative z-10 bg-white dark:bg-gray-950"
                    />
                    <main id="main-content" className="relative flex-1 overflow-auto">
                        {children}
                    </main>
                </div>
            </div>
        </SidebarProvider>
    );
}
