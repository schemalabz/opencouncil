"use client"
import { ChevronDown, ChevronRight, Play, Pause, Loader } from "lucide-react"
import { MEETING_PAGE_SEGMENTS } from "@/lib/utils/meetingPages"
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
import { cn, formatTime, sortSubjectsByAgendaIndex } from "@/lib/utils"
import { categorizeSubjects, SUBJECT_CATEGORIES } from "@/lib/utils/subjects"
import { useTranscriptOptions } from "./options/OptionsContext"

export default function MeetingSidebar() {
    const { city, meeting, subjects } = useCouncilMeetingData()
    const [subjectsExpanded, setSubjectsExpanded] = useState(true)
    const { isMobile, setOpenMobile, state: sidebarState } = useSidebar()
    const pathname = usePathname()
    // State to track both actual path and anticipated path during navigation
    const [activeItem, setActiveItem] = useState(pathname)
    const { options } = useTranscriptOptions()
    const canEdit = options.editsAllowed
    const canCreateHighlights = options.canCreateHighlights

    const { beforeAgenda, outOfAgenda, agenda } = useMemo(() => {
        const categorized = categorizeSubjects(subjects)
        return {
            ...categorized,
            agenda: sortSubjectsByAgendaIndex(categorized.agenda),
        }
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

    type Subject = typeof subjects[number]
    const renderSubjectSection = (title: string, sectionSubjects: Subject[], getPrefix?: (subject: Subject, index: number) => string) => {
        if (sectionSubjects.length === 0) return null
        return (
            <>
                <SidebarMenuItem className="pl-4">
                    <span className="text-xs font-semibold text-muted-foreground tracking-wide py-1">
                        {title}
                    </span>
                </SidebarMenuItem>
                {sectionSubjects.map((subject, index) => {
                    const subjectUrl = `/${city.id}/${meeting.id}/subjects/${subject.id}`
                    return (
                        <SidebarMenuItem key={subject.id} className="pl-8">
                            <SidebarMenuButton
                                asChild
                                onClick={handleMenuItemClick}
                                isActive={activeItem === subjectUrl}
                            >
                                <Link
                                    href={subjectUrl}
                                    className={cn(
                                        activeItem === subjectUrl && "text-primary font-medium"
                                    )}
                                >
                                    <span className="text-sm">{getPrefix ? `${getPrefix(subject, index)} ` : ''}{subject.name}</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    )
                })}
            </>
        )
    }

    const mainMenuItems = [
        { ...MEETING_PAGE_SEGMENTS.overview, url: `/${city.id}/${meeting.id}` },
        { ...MEETING_PAGE_SEGMENTS.map, url: `/${city.id}/${meeting.id}/map` },
        { ...MEETING_PAGE_SEGMENTS.transcript, url: `/${city.id}/${meeting.id}/transcript` },
        ...(canCreateHighlights ? [{ ...MEETING_PAGE_SEGMENTS.highlights, url: `/${city.id}/${meeting.id}/highlights` }] : []),
        { ...MEETING_PAGE_SEGMENTS.settings, url: `/${city.id}/${meeting.id}/settings` },
        ...(canEdit ? [{ ...MEETING_PAGE_SEGMENTS.admin, url: `/${city.id}/${meeting.id}/admin` }] : []),
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
                                    <MEETING_PAGE_SEGMENTS.subjects.icon className="h-4 w-4" />
                                    <span>{MEETING_PAGE_SEGMENTS.subjects.title}</span>
                                    {subjectsExpanded ?
                                        <ChevronDown className="h-4 w-4 ml-auto" /> :
                                        <ChevronRight className="h-4 w-4 ml-auto" />
                                    }
                                </SidebarMenuButton>
                            </SidebarMenuItem>

                            {subjectsExpanded && sidebarState !== 'collapsed' && (
                                <>
                                    {renderSubjectSection(SUBJECT_CATEGORIES.beforeAgenda.shortLabel, beforeAgenda)}
                                    {renderSubjectSection(SUBJECT_CATEGORIES.outOfAgenda.shortLabel, outOfAgenda)}
                                    {renderSubjectSection(SUBJECT_CATEGORIES.agenda.shortLabel, agenda, (s) => `${s.agendaItemIndex}.`)}
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