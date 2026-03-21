"use client"
import { cn } from "@/lib/utils"
import { Link } from '@/i18n/routing'
import Image from 'next/image'
import UserDropdown from "./user-dropdown"
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import { SidebarTrigger } from '../ui/sidebar'
import { City } from '@prisma/client'
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Search, Building2, ChevronRight } from "lucide-react"
import { useRouter, useSelectedLayoutSegment } from "next/navigation"
import { useState, useRef, useEffect } from "react"
import { useSubjectHeaderOptional } from "@/contexts/SubjectHeaderContext"
import { AutoScrollText } from "@/components/ui/auto-scroll-text"
import Icon from "@/components/icon"
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"
import { getNonAgendaLabel } from "@/lib/utils/subjects"

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

function PathElementView({ element, isLast, isSubject, subjectInfo }: {
    element: PathElement
    isLast: boolean
    isSubject: boolean
    subjectInfo?: NonNullable<ReturnType<typeof useSubjectHeaderOptional>>['subjectHeader']
}) {
    const content = (
        <div className="flex flex-col min-w-0 flex-shrink">
            {isSubject && subjectInfo ? (
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                    <div
                        className="p-1 sm:p-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: subjectInfo.topicColor ? subjectInfo.topicColor + "20" : "#e5e7eb" }}
                    >
                        <Icon
                            name={subjectInfo.topicIcon || "Hash"}
                            color={subjectInfo.topicColor || "#9ca3af"}
                            size={14}
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <AutoScrollText>
                            <span className="text-xs sm:text-sm font-medium leading-tight">{element.name}</span>
                        </AutoScrollText>
                        <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-muted-foreground">
                            {subjectInfo.topicName && (
                                <span className="truncate">{subjectInfo.topicName}</span>
                            )}
                            {subjectInfo.agendaItemIndex != null && (
                                <>
                                    <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/40 shrink-0" />
                                    <span className="shrink-0">#{subjectInfo.agendaItemIndex}</span>
                                </>
                            )}
                            {subjectInfo.nonAgendaReason && !subjectInfo.agendaItemIndex && (
                                <>
                                    <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/40 shrink-0" />
                                    <span className="shrink-0">{getNonAgendaLabel(subjectInfo.nonAgendaReason as 'beforeAgenda' | 'outOfAgenda')}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <Link
                        href={element.link}
                        className={cn(
                            "hover:text-primary transition-colors overflow-hidden",
                            element.city ? "text-foreground text-sm sm:text-base md:text-lg font-medium" : "text-muted-foreground"
                        )}
                    >
                        <div className="flex items-center gap-1 sm:gap-2 md:gap-4">
                            {element.city && (
                                <div className="relative h-8 w-8 sm:h-10 sm:w-10 md:h-[60px] md:w-[60px] flex-shrink-0">
                                    {element.city.logoImage ? (
                                        <Image
                                            src={element.city.logoImage}
                                            alt={element.city.name}
                                            fill
                                            sizes="(max-width: 768px) 32px, (max-width: 1024px) 40px, 60px"
                                            style={{ objectFit: 'contain' }}
                                            priority
                                        />
                                    ) : (
                                        <Building2 className="w-full h-full text-gray-400" />
                                    )}
                                </div>
                            )}
                            <span className={cn(
                                "truncate text-xs sm:text-sm md:text-base",
                                element.city && "hidden sm:inline"
                            )}>{element.name}</span>
                        </div>
                    </Link>
                    {element.description && (
                        <span className="text-xs text-muted-foreground truncate hidden sm:block">
                            {element.description}
                        </span>
                    )}
                </>
            )}
        </div>
    )

    return content
}

const Header = ({ path, showSidebarTrigger = false, currentEntity, children, noContainer = false, className }: HeaderProps) => {
    const { scrollY } = useScroll();
    const blurBackgroundOpacity = useTransform(scrollY, [0, 50], [0, 1], { clamp: true });
    const router = useRouter();
    const segment = useSelectedLayoutSegment();
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const searchOverlayRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Optionally consume subject header context (only available inside meeting layout)
    const subjectContext = useSubjectHeaderOptional();
    const subjectHeader = subjectContext?.subjectHeader ?? null;

    // Add dynamic path elements based on the current segment
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

    // Add current meeting sub-page as the last breadcrumb
    // When showSidebarTrigger is true, we're in a meeting layout
    if (showSidebarTrigger) {
        if (subjectHeader) {
            // Subject pages: show subject name with topic info
            dynamicPath.push({
                name: subjectHeader.name,
                link: '', // Current page, no navigation
            });
        } else if (segment !== 'subjects') {
            // Other meeting sub-pages: show page name
            const meetingPageLabels: Record<string, string> = {
                'transcript': 'Απομαγνητοφώνηση',
                'map': 'Χάρτης',
                'highlights': 'Στιγμιότυπα',
                'settings': 'Ρυθμίσεις',
                'admin': 'Διαχείριση',
            };
            const pageLabel = segment ? meetingPageLabels[segment] : 'Σύνοψη';
            if (pageLabel) {
                dynamicPath.push({
                    name: pageLabel,
                    link: '', // Current page, no navigation
                });
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

    // Handle click outside for search modal
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

    // Determine which elements to show on mobile vs desktop
    const hasCollapsiblePath = dynamicPath.length > 2;
    const firstElement = dynamicPath[0];
    const middleElements = hasCollapsiblePath ? dynamicPath.slice(1, -1) : [];
    const lastElement = hasCollapsiblePath ? dynamicPath[dynamicPath.length - 1] : null;
    const isLastSubject = subjectHeader !== null;

    const renderBreadcrumbs = () => {
        if (dynamicPath.length === 0) return null;

        return (
            <>
                {dynamicPath.length > 0 && <Separator orientation="vertical" className="h-8 sm:h-12 mx-1 sm:mx-2 md:mx-6" />}

                <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center flex-1 min-w-0">
                        {/* Desktop: show all elements */}
                        {!hasCollapsiblePath ? (
                            // Simple path (2 or fewer elements) — always show all
                            dynamicPath.map((element, index) => (
                                <div key={element.link || `path-${index}`} className="flex items-center min-w-0 last:flex-1">
                                    {index > 0 && (
                                        <Separator orientation="vertical" className="h-6 sm:h-8 mx-1 sm:mx-2 md:mx-4" />
                                    )}
                                    <PathElementView
                                        element={element}
                                        isLast={index === dynamicPath.length - 1}
                                        isSubject={index === dynamicPath.length - 1 && isLastSubject}
                                        subjectInfo={index === dynamicPath.length - 1 && isLastSubject ? subjectHeader : undefined}
                                    />
                                </div>
                            ))
                        ) : (
                            <>
                                {/* Desktop view: all elements */}
                                <div className="hidden md:flex items-center min-w-0 flex-1">
                                    {dynamicPath.map((element, index) => (
                                        <div key={element.link || `path-${index}`} className="flex items-center min-w-0 last:flex-1">
                                            {index > 0 && (
                                                <Separator orientation="vertical" className="h-6 sm:h-8 mx-1 sm:mx-2 md:mx-4" />
                                            )}
                                            <PathElementView
                                                element={element}
                                                isLast={index === dynamicPath.length - 1}
                                                isSubject={index === dynamicPath.length - 1 && isLastSubject}
                                                subjectInfo={index === dynamicPath.length - 1 && isLastSubject ? subjectHeader : undefined}
                                            />
                                        </div>
                                    ))}
                                </div>

                                {/* Mobile view: first + ellipsis + last */}
                                <div className="flex md:hidden items-center min-w-0 flex-1">
                                    {/* First element (city) */}
                                    <div className="flex items-center min-w-0 shrink-0">
                                        <PathElementView
                                            element={firstElement}
                                            isLast={false}
                                            isSubject={false}
                                        />
                                    </div>

                                    {/* Ellipsis with bottom sheet */}
                                    <Drawer>
                                        <DrawerTrigger asChild>
                                            <button className="flex items-center mx-1 text-muted-foreground hover:text-foreground transition-colors shrink-0">
                                                <ChevronRight className="h-3 w-3" />
                                                <span className="text-xs">...</span>
                                                <ChevronRight className="h-3 w-3" />
                                            </button>
                                        </DrawerTrigger>
                                        <DrawerContent>
                                            <DrawerTitle className="sr-only">Navigation</DrawerTitle>
                                            <nav className="p-4 pb-8 space-y-1">
                                                {dynamicPath.map((element, index) => {
                                                    const isCurrent = index === dynamicPath.length - 1;
                                                    return (
                                                        <div key={element.link || `drawer-${index}`} className="flex items-center gap-2">
                                                            {index > 0 && (
                                                                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                                            )}
                                                            {isCurrent ? (
                                                                <span className="text-sm font-medium py-2 truncate">{element.name}</span>
                                                            ) : (
                                                                <Link
                                                                    href={element.link}
                                                                    className="text-sm text-muted-foreground hover:text-foreground py-2 truncate block"
                                                                >
                                                                    {element.city && element.city.logoImage && (
                                                                        <span className="inline-flex items-center gap-2">
                                                                            <Image
                                                                                src={element.city.logoImage}
                                                                                alt={element.city.name}
                                                                                width={20}
                                                                                height={20}
                                                                                style={{ objectFit: 'contain' }}
                                                                            />
                                                                            {element.name}
                                                                        </span>
                                                                    )}
                                                                    {(!element.city || !element.city.logoImage) && element.name}
                                                                </Link>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </nav>
                                        </DrawerContent>
                                    </Drawer>

                                    {/* Last element */}
                                    {lastElement && (
                                        <div className="flex items-center min-w-0 flex-1">
                                            <PathElementView
                                                element={lastElement}
                                                isLast={true}
                                                isSubject={isLastSubject}
                                                subjectInfo={isLastSubject ? subjectHeader : undefined}
                                            />
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </>
        );
    };

    const renderControls = () => (
        <div className={cn("flex items-center gap-1 sm:gap-2 md:gap-4 flex-shrink-0", noContainer && "ml-1 sm:ml-2 md:ml-4")}>
            {children}
            <div className="flex items-center gap-1 sm:gap-2">
                <button
                    onClick={() => setIsSearchOpen(true)}
                    className="flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-full hover:bg-accent transition-colors"
                    title="Search"
                >
                    <Search className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                </button>
                <UserDropdown currentEntity={currentEntity} />
            </div>
        </div>
    );

    const renderLogo = () => (
        <div className="flex items-center gap-1 sm:gap-2 md:gap-4 z-10 h-full">
            {showSidebarTrigger && <SidebarTrigger />}
            <Link href="/" className="flex items-center gap-1 sm:gap-2 md:gap-3 shrink-0 h-full py-1 sm:py-2">
                <div className="relative h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 p-0">
                    <Image
                        src='/logo.png'
                        alt='logo'
                        fill
                        sizes="(max-width: 768px) 32px, (max-width: 1024px) 40px, 48px"
                        style={{ objectFit: 'contain' }}
                        className="transition-transform"
                    />
                </div>
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
            className={`sticky top-0 z-50 w-full flex justify-between items-stretch min-h-[64px] sm:min-h-[80px] h-16 sm:h-20 relative ${className || ''}`}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
        >
            <motion.div
                className="absolute inset-0 backdrop-blur bg-background/50"
                style={{ opacity: blurBackgroundOpacity }}
            />
            {noContainer ? (
                <div className="flex items-center w-full px-2 sm:px-4 relative">
                    {renderLogo()}
                    {renderCenteredTitle()}
                    {renderBreadcrumbs()}
                    {renderControls()}
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
