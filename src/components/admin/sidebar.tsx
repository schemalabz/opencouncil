import { LayoutDashboard, Users, FileText, Settings, Files, Rocket, UserRound, List, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from "@/components/ui/sidebar";

const menuItems = [
    {
        title: "Dashboard",
        icon: LayoutDashboard,
        url: "/admin",
    },
    {
        title: "Users",
        icon: Users,
        url: "/admin/users",
    },
    {
        title: "People",
        icon: UserRound,
        url: "/admin/people",
    },
    {
        title: "Meetings",
        icon: FileText,
        url: "/admin/meetings",
    },
    {
        title: "Offers",
        icon: Files,
        url: "/admin/offers",
    },
    {
        title: "Tasks",
        icon: List,
        url: "/admin/tasks"
    },
    {
        title: "Elasticsearch",
        icon: Search,
        url: "/admin/elasticsearch",
    },
    {
        title: "Cache",
        icon: RefreshCw,
        url: "/admin/cache",
    },
    {
        title: "Settings",
        icon: Settings,
        url: "/admin/settings",
    },
];

export function AdminSidebar() {
    return (
        <Sidebar collapsible='none' className='h-full'>
            <SidebarHeader className='p-4'>
                <h2 className='text-lg font-semibold'>Admin Panel</h2>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Navigation</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {menuItems.map(item => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton asChild>
                                        <Link href={item.url}>
                                            <item.icon className='h-4 w-4' />
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className='p-4'>
                <p className='text-xs text-muted-foreground'>Admin v1.0</p>
            </SidebarFooter>
        </Sidebar>
    );
}
