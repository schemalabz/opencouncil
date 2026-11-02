"use client"

import { LayoutDashboard, Users, FileText, Files, FileOutput, UserRound, UserCog, List, RefreshCw, Search, Bell, QrCode, ClipboardCheck, MessageSquareText, Landmark, Tag, Building2, BarChart3, Bot, type LucideIcon } from "lucide-react";
import Image from "next/image";
import { Link, usePathname } from "@/i18n/routing";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarTrigger,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { SUPERADMIN_ADMIN_PAGES } from "@/lib/admin/superadminPages";

type MenuItem = { title: string; icon: LucideIcon; url: string };

// A realm admin (#875) sees the pages whose rows carry a city of their
// realms. The menu hides the others, SUPERADMIN_ADMIN_PAGES.
const menuGroups: { label: string; items: MenuItem[] }[] = [
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
            { title: "Team", icon: UserCog, url: "/admin/team" },
            { title: "People", icon: UserRound, url: "/admin/people" },
            { title: "Signups", icon: BarChart3, url: "/admin/signups" },
            { title: "Notifications", icon: Bell, url: "/admin/notifications" },
            { title: "QR Campaigns", icon: QrCode, url: "/admin/qr" },
        ],
    },
    {
        label: "Content",
        items: [
            { title: "Cities", icon: Building2, url: "/admin/cities" },
            { title: "Meetings", icon: FileText, url: "/admin/meetings" },
            { title: "Reviews", icon: ClipboardCheck, url: "/admin/reviews" },
            { title: "Topics", icon: Tag, url: "/admin/topics" },
            { title: "Consultations", icon: MessageSquareText, url: "/admin/consultations" },
            { title: "Decisions", icon: Landmark, url: "/admin/decisions" },
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
            { title: "Machine accounts", icon: Bot, url: "/admin/machines" },
        ],
    },
];

const allUrls = menuGroups.flatMap(group => group.items.map(item => item.url));

export function AdminSidebar({ superadmin }: { superadmin: boolean }) {
    const { isMobile, setOpenMobile } = useSidebar();
    const pathname = usePathname();
    const groups = menuGroups
        .map(group => ({ ...group, items: group.items.filter(item => superadmin || !SUPERADMIN_ADMIN_PAGES.has(item.url)) }))
        .filter(group => group.items.length > 0);

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
        <Sidebar collapsible="icon" className="top-0 h-screen flex flex-col">
            {/* The app's mark heads the nav, not the bar beside it: the nav owns
                the left column top to bottom, so this is where the column starts.
                Same height as the header's first row across the edge, so the two
                bottom borders meet. */}
            <div className="flex h-16 items-center gap-2 px-3 sm:h-20 sm:px-4 group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-2.5">
                <SidebarTrigger className="h-5 w-5 shrink-0 text-muted-foreground/60" />
                {/* Gone at 48px, with the seal. Stacked under the toggle it made the
                    head two nav-items tall for 50px of content, and that slack read
                    as a gap above the first item — at this width the rail is a tool
                    strip, and the mark is back the moment it opens. */}
                <Link href="/" className="flex shrink-0 items-center hover:no-underline group-data-[collapsible=icon]:hidden">
                    <Image src="/logo.png" alt="OpenCouncil" width={120} height={120} className="h-9 w-auto object-contain sm:h-10 md:h-11" />
                </Link>
            </div>
            <SidebarHeader className="flex-none p-4 group-data-[collapsible=icon]:hidden">
                {/* div, not h2: the global h2 rule forces 24px centered text,
                    which fights the sidebar's nav register */}
                <div className="text-lg font-semibold">Admin Panel</div>
            </SidebarHeader>
            <SidebarContent className="flex-1 min-h-0">
                {groups.map(group => (
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
