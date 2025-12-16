"use client"
import { LayoutDashboard, FileText, Share2, BarChart2, Mic, ChevronDown, ChevronRight, Play, Pause, Loader, Settings, Star, Map, Bolt } from "lucide-react"
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
    SidebarTrigger,
    useSidebar,
} from "@/components/ui/sidebar"
import Link from "next/link"
import { useCouncilMeetingData } from "./CouncilMeetingDataContext"
import { useState, useEffect, useMemo } from "react"
import { useVideo } from "./VideoProvider"
import { usePathname } from "next/navigation"
import { cn, formatTime } from "@/lib/utils"
import { sortSubjectsByImportance } from "@/lib/utils"
import { useTranscriptOptions } from "./options/OptionsContext"

export default function MeetingSidebar() {
    const { city, meeting, subjects } = useCouncilMeetingData()
    const [subjectsExpanded, setSubjectsExpanded] = useState(true)
    const { isMobile, setOpenMobile } = useSidebar()
    const pathname = usePathname()
    // State to track both actual path and anticipated path during navigation
    const [activeItem, setActiveItem] = useState(pathname)
    const { options } = useTranscriptOptions()
    const canEdit = options.editsAllowed

    // Sort subjects by appearance (chronological) for the sidebar
    const chronologicalSubjects = useMemo(() => {
        return sortSubjectsByImportance(subjects, 'appearance')
    }, [subjects])

    // Sync with pathname when it changes
    useEffect(() => {
        setActiveItem(pathname)
    }, [pathname])

    // Listen for navigation events to update active item immediately
    useEffect(() => {
        const handleNavStart = (e: Event) => {
            const customEvent = e as CustomEvent
            if (customEvent.detail && customEvent.detail.path) {
                setActiveItem(customEvent.detail.path)
            }
        }

        document.addEventListener('navigationstart', handleNavStart)

        return () => {
            document.removeEventListener('navigationstart', handleNavStart)
        }
    }, [])

    const handleMenuItemClick = () => {
        // Only close sidebar on mobile
        if (isMobile) {
            setOpenMobile(false)
        }
    }

    // Check if a menu item is currently active based on activeItem
    const isActive = (url: string) => {
        // Handle root meeting path (dashboard)
        if (url === `/${city.id}/${meeting.id}` && activeItem === `/${city.id}/${meeting.id}`) {
            return true
        }

        // Handle other paths
        return activeItem.startsWith(url) && url !== `/${city.id}/${meeting.id}`
    }

    // Check if subjects section is active
    const isSubjectsActive = () => {
        return activeItem.includes(`/${city.id}/${meeting.id}/subjects`)
    }

    const mainMenuItems = [
        {
            title: "Σύνοψη",
            icon: LayoutDashboard,
            url: `/${city.id}/${meeting.id}`
        },
        {
            title: "Χάρτης",
            icon: Map,
            url: `/${city.id}/${meeting.id}/map`
        },
        {
            title: "Απομαγνητοφώνηση",
            icon: Mic,
            url: `/${city.id}/${meeting.id}/transcript`
        },
        {
            title: "Στατιστικά",
            icon: BarChart2,
            url: `/${city.id}/${meeting.id}/statistics`
        },
        {
            title: "Ρυθμίσεις",
            icon: Settings,
            url: `/${city.id}/${meeting.id}/settings`
        },
        ...(canEdit ? [{
            title: "Διαχείριση",
            icon: Bolt,
            url: `/${city.id}/${meeting.id}/admin`
        },
        {
            title: "Highlights",
            icon: Star,
            url: `/${city.id}/${meeting.id}/highlights`
        },
        ] : [])
    ]

    return (
        <Sidebar collapsible="icon" className="h-[calc(100vh-theme(spacing.14))] flex flex-col">
            <SidebarHeader className="flex-none p-4">
                <ControlsWidget />
            </SidebarHeader>
            <SidebarContent className="flex-1 min-h-0">
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {mainMenuItems.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton
                                        asChild
                                        onClick={handleMenuItemClick}
                                        isActive={isActive(item.url)}
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

                            <SidebarMenuItem>
                                <SidebarMenuButton
                                    onClick={() => setSubjectsExpanded(!subjectsExpanded)}
                                    isActive={isSubjectsActive()}
                                    className={cn(
                                        isSubjectsActive() && "text-primary font-medium"
                                    )}
                                >
                                    <FileText className="h-4 w-4" />
                                    <span>Θέματα</span>
                                    {subjectsExpanded ?
                                        <ChevronDown className="h-4 w-4 ml-auto" /> :
                                        <ChevronRight className="h-4 w-4 ml-auto" />
                                    }
                                </SidebarMenuButton>
                            </SidebarMenuItem>

                            {subjectsExpanded && (
                                <>
                                    <SidebarMenuItem className="pl-8">
                                        <SidebarMenuButton
                                            asChild
                                            onClick={handleMenuItemClick}
                                            isActive={activeItem === `/${city.id}/${meeting.id}/subjects`}
                                        >
                                            <Link
                                                href={`/${city.id}/${meeting.id}/subjects`}
                                                className={cn(
                                                    activeItem === `/${city.id}/${meeting.id}/subjects` && "text-primary font-medium"
                                                )}
                                            >
                                                <span className="text-sm font-bold">Όλα τα θέματα</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                    {chronologicalSubjects?.map((subject) => (
                                        <SidebarMenuItem key={subject.id} className="pl-8">
                                            <SidebarMenuButton
                                                asChild
                                                onClick={handleMenuItemClick}
                                                isActive={activeItem === `/${city.id}/${meeting.id}/subjects/${subject.id}`}
                                            >
                                                <Link
                                                    href={`/${city.id}/${meeting.id}/subjects/${subject.id}`}
                                                    className={cn(
                                                        activeItem === `/${city.id}/${meeting.id}/subjects/${subject.id}` && "text-primary font-medium"
                                                    )}
                                                >
                                                    <span className="text-sm">{subject.name}</span>
                                                </Link>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    ))}
                                </>
                            )}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
                <div className="h-20 shrink-0" />
            </SidebarContent>
        </Sidebar>
    )
}

function ControlsWidget() {
    const { isPlaying, togglePlayPause, isSeeking, currentTime, duration } = useVideo();
    const { state } = useSidebar();

    if (state === "collapsed") {
        return (
            <button onClick={togglePlayPause} className="flex items-center justify-center">
                {isPlaying ?
                    (isSeeking ? <Loader className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />)
                    : <Play className="h-4 w-4" />
                }
            </button>
        );
    }

    return (
        <div className="w-full space-y-2">
            <div className="flex items-center justify-between">
                <button onClick={togglePlayPause} className="flex items-center gap-2">
                    {isPlaying ?
                        (isSeeking ? <Loader className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />)
                        : <Play className="h-4 w-4" />
                    }
                    <span className="text-sm">{formatTime(currentTime)}</span>
                </button>
                <span className="text-sm text-muted-foreground">{formatTime(duration)}</span>
            </div>
            <div className="h-1 w-full rounded-full bg-secondary">
                <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                />
            </div>
        </div>
    );
}