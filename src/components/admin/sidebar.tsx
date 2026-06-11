"use client"

import { LayoutDashboard, Users, FileText, Files, FileOutput, UserRound, List, RefreshCw, Search, Bell, QrCode, ClipboardCheck, MessageSquareText, Landmark, Tag, KeyRound, MessageCircle } from "lucide-react";
import { Link, usePathname } from "@/i18n/routing";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const menuGroups = [
    {
        label: "Overview",
        items: [
            { title: "Dashboard", icon: LayoutDashboard, url: "/admin" },
        ],
    },
    {
        label: "Community",
        items: [
            { title: "Users", icon: Users, url: "/admin/users" },
            { title: "People", icon: UserRound, url: "/admin/people" },
            { title: "Notifications", icon: Bell, url: "/admin/notifications" },
            { title: "Conversations", icon: MessageCircle, url: "/admin/conversations" },
            { title: "QR Campaigns", icon: QrCode, url: "/admin/qr" },
        ],
    },
    {
        label: "Content",
        items: [
            { title: "Meetings", icon: FileText, url: "/admin/meetings" },
            { title: "Reviews", icon: ClipboardCheck, url: "/admin/reviews" },
            { title: "Topics", icon: Tag, url: "/admin/topics" },
            { title: "Consultations", icon: MessageSquareText, url: "/admin/consultations" },
            { title: "Diavgeia", icon: Landmark, url: "/admin/diavgeia" },
            { title: "Offers", icon: Files, url: "/admin/offers" },
            { title: "Reports", icon: FileOutput, url: "/admin/reports" },
        ],
    },
    {
        label: "System",
        items: [
            { title: "Tasks", icon: List, url: "/admin/tasks" },
            { title: "Elasticsearch", icon: Search, url: "/admin/elasticsearch" },
            { title: "Cache", icon: RefreshCw, url: "/admin/cache" },
            { title: "API Keys", icon: KeyRound, url: "/admin/settings/api-keys" },
        ],
    },
];

const allUrls = menuGroups.flatMap(group => group.items.map(item => item.url));

export function AdminSidebar() {
    const { isMobile, setOpenMobile } = useSidebar();
    const pathname = usePathname();

    // Longest matching prefix wins, so exactly one item is active ("/admin"
    // doesn't shadow its sub-pages, and nested routes keep their parent lit).
    const activeUrl = allUrls
        .filter(url => pathname === url || pathname.startsWith(url + "/"))
        .sort((a, b) => b.length - a.length)[0];
    const isActive = (url: string) => url === activeUrl;

    const handleMenuItemClick = () => {
        if (isMobile) {
            setOpenMobile(false);
        }
    };

    return (
        <Sidebar collapsible="icon" className="h-[calc(100vh-theme(spacing.20))] flex flex-col">
            <SidebarHeader className="flex-none p-4 group-data-[collapsible=icon]:hidden">
                {/* div, not h2: the global h2 rule forces 24px centered text,
                    which fights the sidebar's nav register */}
                <div className="text-lg font-semibold">Admin Panel</div>
            </SidebarHeader>
            <SidebarContent className="flex-1 min-h-0">
                {menuGroups.map(group => (
                    <SidebarGroup key={group.label}>
                        <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {group.items.map(item => (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton
                                            asChild
                                            onClick={handleMenuItemClick}
                                            isActive={isActive(item.url)}
                                            tooltip={item.title}
                                        >
                                            <Link href={item.url} className={cn(
                                                isActive(item.url) && "text-primary font-medium"
                                            )}>
                                                <item.icon className="h-4 w-4" />
                                                <span>{item.title}</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                ))}
            </SidebarContent>
        </Sidebar>
    );
}
