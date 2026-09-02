"use client"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useSubjectBarHover } from '@/components/meetings/bar/BarHighlightContext';
import Image from "next/image";
import { getMeetingPageSegments } from "@/lib/utils/meetingPages"
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
import { usePathname } from "next/navigation"
import { cn, sortSubjectsByAgendaIndex } from "@/lib/utils"
import { categorizeSubjects, getSubjectCategories } from "@/lib/utils/subjects"
import { useTranscriptOptions } from "./options/OptionsContext"
import { useTranslations } from 'next-intl'

export default function MeetingSidebar() {
    const { city, meeting, subjects } = useCouncilMeetingData()
    const tCommon = useTranslations('Common')
    const meetingPageSegments = getMeetingPageSegments(useTranslations('CouncilMeeting'))
    const subjectCategories = getSubjectCategories(useTranslations('Subject'))
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
                {sectionSubjects.map((subject, index) => (
                    <SidebarSubjectItem
                        key={subject.id}
                        subjectId={subject.id}
                        href={`/${city.id}/${meeting.id}/subjects/${subject.id}`}
                        label={`${getPrefix ? `${getPrefix(subject, index)} ` : ''}${subject.name}`}
                        isActive={activeItem === `/${city.id}/${meeting.id}/subjects/${subject.id}`}
                        onNavigate={handleMenuItemClick}
                    />
                ))}
            </>
        )
    }

    const mainMenuItems = [
        { ...meetingPageSegments.overview, url: `/${city.id}/${meeting.id}` },
        { ...meetingPageSegments.map, url: `/${city.id}/${meeting.id}/map` },
        { ...meetingPageSegments.transcript, url: `/${city.id}/${meeting.id}/transcript` },
        ...(canCreateHighlights ? [{ ...meetingPageSegments.highlights, url: `/${city.id}/${meeting.id}/highlights` }] : []),
        ...(canEdit ? [{ ...meetingPageSegments.decisions, url: `/${city.id}/${meeting.id}/decisions` }] : []),
        ...(canEdit ? [{ ...meetingPageSegments.admin, url: `/${city.id}/${meeting.id}/admin` }] : []),
    ]

    return (
        <Sidebar collapsible="icon" className="top-0 h-screen flex flex-col">
            <SidebarHeader className="flex-none p-0">
            {/* The app's mark heads the nav, not the bar beside it: the nav owns
                the left column top to bottom, so this is where the column starts.
                Same height as the header's first row across the edge, so the two
                bottom borders meet. */}
            <div className="flex h-14 items-center gap-2 px-3 sm:h-20 sm:px-4 group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-2.5">
                <SidebarTrigger className="h-5 w-5 shrink-0 text-muted-foreground/60" />
                {/* Gone at 48px, with the seal. Stacked under the toggle it made the
                    head two nav-items tall for 50px of content, and that slack read
                    as a gap above the first item — at this width the rail is a tool
                    strip, and the mark is back the moment it opens. */}
                <Link href="/" className="flex shrink-0 items-center hover:no-underline group-data-[collapsible=icon]:hidden">
                    <Image src="/logo.png" alt="OpenCouncil" width={120} height={120} className="h-9 w-auto object-contain sm:h-10 md:h-11" />
                </Link>
                {/* The municipality sits left of the rule with everything else that
                    is not the page: a lockup needs width, and there is none at
                    48px, so it goes rather than shrinking into illegibility. */}
                {city.logoImage && (
                    <Link href={`/${city.id}`} className="flex min-w-0 shrink items-center hover:no-underline group-data-[collapsible=icon]:hidden" aria-hidden tabIndex={-1}>
                        <Image src={city.logoImage} alt="" width={120} height={120} className="h-8 w-auto max-w-[96px] object-contain" />
                    </Link>
                )}
            </div>
            </SidebarHeader>
            <SidebarContent className="flex-1 min-h-0">
                <SidebarGroup>
                    <SidebarGroupContent>
                        <nav aria-label={tCommon('meetingNavigation')}>
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
                                    <meetingPageSegments.subjects.icon className="h-4 w-4" />
                                    <span>{meetingPageSegments.subjects.title}</span>
                                    {subjectsExpanded ?
                                        <ChevronDown className="h-4 w-4 ml-auto" /> :
                                        <ChevronRight className="h-4 w-4 ml-auto" />
                                    }
                                </SidebarMenuButton>
                            </SidebarMenuItem>

                            {subjectsExpanded && sidebarState !== 'collapsed' && (
                                <>
                                    {renderSubjectSection(subjectCategories.beforeAgenda.shortLabel, beforeAgenda)}
                                    {renderSubjectSection(subjectCategories.outOfAgenda.shortLabel, outOfAgenda)}
                                    {renderSubjectSection(subjectCategories.agenda.shortLabel, agenda, (s) => `${s.agendaItemIndex}.`)}
                                </>
                            )}
                        </SidebarMenu>
                        </nav>
                    </SidebarGroupContent>
                </SidebarGroup>
                <div className="h-20 shrink-0" />
            </SidebarContent>
        </Sidebar>
    )
}

/**
 * One subject in the nav. Its own component so hovering it can light the
 * subject's runs on the playback bar (one hook per row).
 */
function SidebarSubjectItem({ subjectId, href, label, isActive, onNavigate }: {
    subjectId: string;
    href: string;
    label: string;
    isActive: boolean;
    onNavigate: () => void;
}) {
    const barHover = useSubjectBarHover(subjectId);
    return (
        <SidebarMenuItem className="pl-8" {...barHover}>
            <SidebarMenuButton asChild onClick={onNavigate} isActive={isActive}>
                <Link href={href} prefetch={false} className={cn(isActive && "text-primary font-medium")}>
                    <span className="text-sm">{label}</span>
                </Link>
            </SidebarMenuButton>
        </SidebarMenuItem>
    );
}
