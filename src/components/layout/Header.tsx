"use client"
import { cn } from "@/lib/utils"
import { Link } from '@/i18n/routing'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import UserDropdown from "./user-dropdown"
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import { SidebarTrigger } from '../ui/sidebar'
import { City } from '@prisma/client'
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Search, Building2, ChevronRight, type LucideIcon } from "lucide-react"
import { useRouter, useSelectedLayoutSegment } from "next/navigation"
import { useState, useRef, useEffect } from "react"
import { useSubjectHeaderOptional, SubjectHeaderInfo } from "@/contexts/SubjectHeaderContext"
import { AutoScrollText } from "@/components/ui/auto-scroll-text"
import Icon from "@/components/icon"
import { MEETING_PAGE_SEGMENTS } from "@/lib/utils/meetingPages"

export interface PathElement {
    name: string
    link: string
    description?: string
    city?: City
}

interface HeaderProps {
    path: PathElement[]
    showSidebarTrigger?: boolean
    currentEntity?: { cityId: string }
    children?: React.ReactNode
    noContainer?: boolean
    className?: string
}

function CityElement({ element }: { element: PathElement }) {
    return (
        <Link
            href={element.link}
            className="hover:text-primary transition-colors text-foreground text-sm sm:text-base md:text-lg font-medium"
        >
            <div className="flex items-center gap-1 sm:gap-2 md:gap-4">
                {element.city && (
                    element.city.logoImage ? (
                        <Image
                            src={element.city.logoImage}
                            alt={element.city.name}
                            width={120}
                            height={120}
                            className="h-14 sm:h-12 md:h-14 w-auto max-w-24 sm:max-w-20 md:max-w-28 object-contain flex-shrink-0"
                            priority
                        />
                    ) : (
                        <Building2 className="h-14 w-14 sm:h-12 sm:w-12 md:h-14 md:w-14 text-gray-400 flex-shrink-0" />
                    )
                )}
                <span className={cn(
                    "truncate text-xs sm:text-sm md:text-base",
                    element.city && "hidden sm:inline"
                )}>{element.name}</span>
            </div>
        </Link>
    )
}

function CurrentPageTitle({ element, autoScroll }: {
    element: PathElement
    autoScroll?: boolean
}) {
    if (autoScroll) {
        return (
            <AutoScrollText>
                <span className="text-sm sm:text-base font-medium leading-tight">{element.name}</span>
            </AutoScrollText>
        )
    }

    return (
        <span className="text-sm sm:text-base font-medium truncate">{element.name}</span>
    )
}

function TopicIconBadge({ subjectInfo }: {
    subjectInfo: SubjectHeaderInfo
}) {
    return (
        <div
            className="h-9 w-9 sm:h-10 sm:w-10 flex items-center justify-center rounded-full shrink-0"
            style={{ backgroundColor: subjectInfo.topicColor ? subjectInfo.topicColor + "20" : "#e5e7eb" }}
        >
            <Icon
                name={subjectInfo.topicIcon || "Hash"}
                color={subjectInfo.topicColor || "#9ca3af"}
                size={18}
            />
        </div>
    )
}

function PageIconBadge({ icon: IconComponent }: { icon: LucideIcon }) {
    return (
        <div className="h-9 w-9 sm:h-10 sm:w-10 flex items-center justify-center rounded-full shrink-0 bg-gray-100">
            <IconComponent className="h-[18px] w-[18px] text-gray-400" />
        </div>
    )
}

const Header = ({ path, showSidebarTrigger = false, currentEntity, children, noContainer = false, className }: HeaderProps) => {
    const t = useTranslations("Header");
    const { scrollY } = useScroll();
    const blurBackgroundOpacity = useTransform(scrollY, [0, 50], [0, 1], { clamp: true });
    const router = useRouter();
    const segment = useSelectedLayoutSegment();
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isContentScrolled, setIsContentScrolled] = useState(false);
    const searchOverlayRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const subjectContext = useSubjectHeaderOptional();
    const subjectHeader = subjectContext?.subjectHeader ?? null;

    const dynamicPath = [...path];
    if (segment === 'notifications') {
        dynamicPath.push({
            name: "Ενημερώσεις",
            link: `/${currentEntity?.cityId}/notifications`
        });
    } else if (segment === 'petition') {
        dynamicPath.push({
            name: "Υποστήριξη Δήμου",
            link: `/${currentEntity?.cityId}/petition`
        });
    }

    if (showSidebarTrigger) {
        if (subjectHeader) {
            dynamicPath.push({
                name: subjectHeader.name,
                link: '',
            });
        } else {
            const pageConfig = segment ? MEETING_PAGE_SEGMENTS[segment] : null;
            if (pageConfig) {
                dynamicPath.push({ name: pageConfig.title, link: '' });
            }
        }
    }

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            const searchUrl = currentEntity?.cityId
                ? `/search?query=${encodeURIComponent(searchQuery.trim())}&cityId=${currentEntity.cityId}`
                : `/search?query=${encodeURIComponent(searchQuery.trim())}`;
            router.push(searchUrl);
            setSearchQuery("");
            setIsSearchOpen(false);
        }
    };

    const handleChatClick = () => {
        const chatUrl = currentEntity?.cityId
            ? `/chat?cityId=${currentEntity.cityId}`
            : '/chat';
        router.push(chatUrl);
        setIsSearchOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchOverlayRef.current && !searchOverlayRef.current.contains(event.target as Node)) {
                setIsSearchOpen(false);
            }
        };

        if (isSearchOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            searchInputRef.current?.focus();
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isSearchOpen]);

    useEffect(() => {
        if (!showSidebarTrigger) return;

        const scrollContainer = document.querySelector('[data-meeting-scroll]');
        if (!scrollContainer) return;

        const handleScroll = () => {
            setIsContentScrolled(scrollContainer.scrollTop > 20);
        };

        scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, [showSidebarTrigger]);

    const isMeetingContext = showSidebarTrigger && dynamicPath.length >= 2;
    const cityElement = dynamicPath[0];
    const currentPageElement = isMeetingContext ? dynamicPath[dynamicPath.length - 1] : null;
    const middleElements = isMeetingContext ? dynamicPath.slice(1, -1) : dynamicPath.slice(1);
    const isCurrentSubject = subjectHeader !== null;
    const pageIcon = (showSidebarTrigger && !subjectHeader)
        ? MEETING_PAGE_SEGMENTS[segment ?? 'overview']?.icon
        : null;

    const renderBreadcrumbs = () => {
        if (dynamicPath.length === 0) return null;

        return (
            <>
                <Separator orientation="vertical" className="h-8 sm:h-12 mx-2 sm:mx-2 md:mx-6" />

                <div className="shrink-0">
                    <CityElement element={cityElement} />
                </div>

                {isMeetingContext ? (
                    <>
                        <Separator orientation="vertical" className="h-8 sm:h-12 mx-1 sm:mx-2 md:mx-4 hidden sm:block" />

                        <div className="hidden sm:flex items-center min-w-0 flex-1 gap-2">
                            {isCurrentSubject && subjectHeader ? (
                                <TopicIconBadge subjectInfo={subjectHeader} />
                            ) : pageIcon && (
                                <PageIconBadge icon={pageIcon} />
                            )}
                            {renderMeetingBreadcrumbContent()}
                        </div>
                    </>
                ) : (
                    middleElements.map((element, index) => (
                        <div key={element.link || `path-${index}`} className="flex items-center min-w-0">
                            <Separator orientation="vertical" className="h-6 sm:h-8 mx-1 sm:mx-2 md:mx-4" />
                            <Link
                                href={element.link}
                                className="hover:text-primary transition-colors text-muted-foreground truncate text-xs sm:text-sm md:text-base"
                            >
                                {element.name}
                            </Link>
                            {element.description && (
                                <span className="text-xs text-muted-foreground truncate hidden sm:block ml-2">
                                    {element.description}
                                </span>
                            )}
                        </div>
                    ))
                )}
            </>
        );
    };

    const renderControls = () => (
        <div className={cn("flex items-center gap-1 sm:gap-2 md:gap-4 flex-shrink-0 ml-auto", noContainer && "sm:ml-1 md:ml-4")}>
            {children}
            <div className="flex items-center gap-1 sm:gap-2">
                <button
                    onClick={() => setIsSearchOpen(true)}
                    className="flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-full hover:bg-accent transition-colors"
                    aria-label={t('search')}
                    title={t('search')}
                >
                    <Search className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                </button>
                <UserDropdown currentEntity={currentEntity} />
            </div>
        </div>
    );

    const renderMeetingBreadcrumbContent = () => (
        <div className="flex flex-col justify-center min-w-0 flex-1">
            {middleElements.length > 0 && (
                <div className="flex items-center gap-1 min-w-0">
                    {middleElements.map((element, index) => (
                        <div key={element.link || `mid-${index}`} className="flex items-center gap-1 min-w-0">
                            {index > 0 && (
                                <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/60 shrink-0" />
                            )}
                            <Link
                                href={element.link}
                                className="text-[11px] sm:text-xs text-muted-foreground hover:text-foreground transition-colors truncate"
                            >
                                {element.name}
                            </Link>
                        </div>
                    ))}
                </div>
            )}
            {currentPageElement && (
                <CurrentPageTitle
                    element={currentPageElement}
                    autoScroll={isCurrentSubject}
                />
            )}
        </div>
    );

    const renderMobileBreadcrumbRow = () => (
        <div className="sm:hidden flex items-center min-w-0 px-2 pb-1 gap-2">
            {showSidebarTrigger && <SidebarTrigger className="shrink-0 h-5 w-5 text-muted-foreground/60" />}
            {isCurrentSubject && subjectHeader ? (
                <TopicIconBadge subjectInfo={subjectHeader} />
            ) : pageIcon && (
                <PageIconBadge icon={pageIcon} />
            )}
            {renderMeetingBreadcrumbContent()}
        </div>
    );

    const renderLogo = () => (
        <div className="flex items-center gap-1 sm:gap-2 md:gap-4 z-10 h-full">
            {showSidebarTrigger && <SidebarTrigger className={cn("h-5 w-5 text-muted-foreground/60", isMeetingContext && "hidden sm:flex")} />}
            <Link href="/" className="flex items-center gap-1 sm:gap-2 md:gap-3 shrink-0 h-full py-0 sm:py-2">
                <Image
                    src='/logo.png'
                    alt='logo'
                    width={120}
                    height={120}
                    className="h-14 sm:h-12 md:h-14 w-auto object-contain transition-transform"
                />
                {dynamicPath.length === 0 && (
                    <span className="text-sm sm:text-lg md:text-xl md:hidden">OpenCouncil</span>
                )}
            </Link>
        </div>
    );

    const renderCenteredTitle = () => {
        if (dynamicPath.length > 0) return null;
        return (
            <div className="absolute left-0 right-0 hidden md:flex justify-center items-center pointer-events-none">
                <Link href="/" className={cn("pointer-events-auto", noContainer ? "hover:no-underline" : "hover:underline")}>
                    <span className="text-xl font-medium">OpenCouncil</span>
                </Link>
            </div>
        );
    };

    return (
        <motion.header
            className={cn(
                "sticky top-0 z-50 w-full flex justify-between items-stretch relative",
                isMeetingContext ? "min-h-0 sm:min-h-[80px] h-auto sm:h-20" : "min-h-[64px] sm:min-h-[80px] h-16 sm:h-20",
                className
            )}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
        >
            <motion.div
                className="absolute inset-0 backdrop-blur bg-background/50"
                style={{ opacity: blurBackgroundOpacity }}
            />
            {noContainer ? (
                <div className="flex flex-col w-full px-2 sm:px-4 relative">
                    <div className={cn(
                        "flex items-center flex-1 transition-all duration-300 ease-in-out",
                        isMeetingContext && isContentScrolled
                            ? "max-h-0 opacity-0 overflow-hidden sm:max-h-none sm:opacity-100 sm:overflow-visible"
                            : "max-h-40 sm:max-h-20 opacity-100",
                        isMeetingContext && "py-1.5 sm:py-0"
                    )}>
                        {renderLogo()}
                        {renderCenteredTitle()}
                        {renderBreadcrumbs()}
                        {renderControls()}
                    </div>
                    {isMeetingContext && renderMobileBreadcrumbRow()}
                </div>
            ) : (
                <div className="container mx-auto h-full">
                    <div className="flex items-center w-full px-2 sm:px-4 relative h-full">
                        {renderLogo()}
                        {renderCenteredTitle()}
                        {renderBreadcrumbs()}
                        {renderControls()}
                    </div>
                </div>
            )}

            {/* Search Modal */}
            <AnimatePresence>
                {isSearchOpen && (
                    <div className="fixed inset-0 z-50">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                        />
                        <div className="absolute inset-0 flex items-center justify-center p-4">
                            <motion.div
                                ref={searchOverlayRef}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="relative w-full max-w-2xl bg-background rounded-lg shadow-lg border"
                            >
                                <form onSubmit={handleSearch} className="relative p-3 sm:p-4">
                                    <Search className="absolute left-6 sm:left-7 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        ref={searchInputRef}
                                        type="text"
                                        placeholder="Αναζήτηση..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-8 sm:pl-9 h-10 sm:h-12 text-sm sm:text-base"
                                        aria-label={t('search')}
                                        autoFocus
                                    />
                                </form>
                                <div className="px-3 sm:px-4 pb-3 sm:pb-4">
                                    <button
                                        onClick={handleChatClick}
                                        className="w-full text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors flex justify-end underline decoration-1 underline-offset-4"
                                    >
                                        ή συνομιλήστε με το OpenCouncil AI
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                )}
            </AnimatePresence>
        </motion.header>
    )
}

export default Header
