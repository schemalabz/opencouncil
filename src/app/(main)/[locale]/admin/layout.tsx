import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AdminSidebar } from "@/components/admin/sidebar"

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-[calc(100vh-65px)]">
            <SidebarProvider>
                <AdminSidebar />
                <main className="flex-1">
                    <SidebarTrigger />
                    {children}
                </main>
            </SidebarProvider>
        </div>
    )
}
