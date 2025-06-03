"use client"
import { cn } from "@/lib/utils"
import { Link } from '@/i18n/routing'
import { useLocale } from 'next-intl'
import Image from 'next/image'
import UserDropdown from "./user-dropdown"
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import { SidebarTrigger } from '../ui/sidebar'
import { City } from '@prisma/client'
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Search, Building2 } from "lucide-react"
import { useRouter, useSelectedLayoutSegment } from "next/navigation"
import { useState, useRef, useEffect } from "react"

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

const Header = ({ path, showSidebarTrigger = false, currentEntity, children, noContainer = false, className }: HeaderProps) => {
    const { scrollY } = useScroll();
    const borderOpacity = useTransform(scrollY, [0, 10], [0, 1], { clamp: true });
    const blurBackgroundOpacity = useTransform(scrollY, [0, 50], [0, 1], { clamp: true });
    const router = useRouter();
    const segment = useSelectedLayoutSegment();
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const searchOverlayRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

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
            // Focus the input when search opens
            searchInputRef.current?.focus();
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isSearchOpen]);

    return (
        <motion.header
            className={`sticky top-0 z-50 w-full flex justify-between items-stretch min-h-[80px] h-20 relative ${className || ''}`}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
        >
            <motion.div
                className="absolute inset-0 backdrop-blur bg-background/50"
                style={{ opacity: blurBackgroundOpacity }}
            />
            {noContainer ? (
                <div className="flex items-center w-full px-4 relative">
                    <div className="flex items-center gap-2 md:gap-4 z-10 h-full">
                        {showSidebarTrigger && <SidebarTrigger />}
                        <Link href="/" className="flex items-center gap-2 md:gap-3 shrink-0 h-full py-2">
                            <div className="relative h-full aspect-square p-0">
                                <Image
                                    src='/logo.png'
                                    alt='logo'
                                    fill
                                    sizes="(max-width: 768px) 80px, 80px"
                                    style={{ objectFit: 'contain' }}
                                    className="transition-transform"
                                />
                            </div>
                            {dynamicPath.length === 0 && (
                                <span className="text-lg md:text-xl md:hidden">OpenCouncil</span>
                            )}
                        </Link>
                    </div>

                    {dynamicPath.length === 0 && (
                        <div className="absolute left-0 right-0 hidden md:flex justify-center items-center pointer-events-none">
                            <Link href="/" className="pointer-events-auto hover:no-underline">
                                <span className="text-xl font-medium">OpenCouncil</span>
                            </Link>
                        </div>
                    )}

                    {dynamicPath.length > 0 && <Separator orientation="vertical" className="h-12 mx-2 md:mx-6" />}

                    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center flex-1 min-w-0">
                            {dynamicPath.map((element, index) => (
                                <div key={element.link} className="flex items-center min-w-0 last:flex-1">
                                    {index > 0 && (
                                        <Separator orientation="vertical" className="h-8 mx-2 md:mx-4" />
                                    )}
                                    <div className="flex flex-col min-w-0 flex-shrink">
                                        <Link
                                            href={element.link}
                                            className={cn(
                                                "hover:text-primary transition-colors overflow-hidden",
                                                element.city ? "text-foreground text-lg font-medium" : "text-muted-foreground"
                                            )}
                                        >
                                            <div className="flex items-center gap-2 md:gap-4">
                                                {element.city && (
                                                    <div className="relative h-[48px] md:h-[60px] w-[48px] md:w-[60px] flex-shrink-0">
                                                        {element.city.logoImage ? (
                                                            <Image
                                                                src={element.city.logoImage}
                                                                alt={element.city.name}
                                                                fill
                                                                sizes="(max-width: 768px) 48px, 60px"
                                                                style={{ objectFit: 'contain' }}
                                                                priority
                                                            />
                                                        ) : (
                                                            <Building2 className="w-full h-full text-gray-400" />
                                                        )}
                                                    </div>
                                                )}
                                                <span className={cn(
                                                    "truncate",
                                                    element.city && "hidden md:inline"
                                                )}>{element.name}</span>
                                            </div>
                                        </Link>
                                        {element.description && (
                                            <span className="text-xs md:text-sm text-muted-foreground truncate">
                                                {element.description}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-4 flex-shrink-0 ml-2 md:ml-4">
                        {children}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setIsSearchOpen(true)}
                                className="flex items-center justify-center h-9 w-9 rounded-full hover:bg-accent transition-colors"
                                title="Search"
                            >
                                <Search className="h-4 w-4 text-muted-foreground" />
                            </button>
                            <UserDropdown currentEntity={currentEntity} />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="container mx-auto h-full">
                    <div className="flex items-center w-full px-4 relative h-full">
                        <div className="flex items-center gap-2 md:gap-4 z-10 h-full">
                            {showSidebarTrigger && <SidebarTrigger />}
                            <Link href="/" className="flex items-center gap-2 md:gap-3 shrink-0 h-full py-2">
                                <div className="relative h-full aspect-square p-0">
                                    <Image
                                        src='/logo.png'
                                        alt='logo'
                                        fill
                                        sizes="(max-width: 768px) 80px, 80px"
                                        style={{ objectFit: 'contain' }}
                                        className="transition-transform"
                                    />
                                </div>
                                {dynamicPath.length === 0 && (
                                    <span className="text-lg md:text-xl md:hidden">OpenCouncil</span>
                                )}
                            </Link>
                        </div>

                        {dynamicPath.length === 0 && (
                            <div className="absolute left-0 right-0 hidden md:flex justify-center items-center pointer-events-none">
                                <Link href="/" className="pointer-events-auto hover:underline">
                                    <span className="text-xl font-medium">OpenCouncil</span>
                                </Link>
                            </div>
                        )}

                        {dynamicPath.length > 0 && <Separator orientation="vertical" className="h-12 mx-2 md:mx-6" />}

                        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                            <div className="flex items-center flex-1 min-w-0">
                                {dynamicPath.map((element, index) => (
                                    <div key={element.link} className="flex items-center min-w-0 last:flex-1">
                                        {index > 0 && (
                                            <Separator orientation="vertical" className="h-8 mx-2 md:mx-4" />
                                        )}
                                        <div className="flex flex-col min-w-0 flex-shrink">
                                            <Link
                                                href={element.link}
                                                className={cn(
                                                    "hover:text-primary transition-colors overflow-hidden",
                                                    element.city ? "text-foreground text-lg font-medium" : "text-muted-foreground"
                                                )}
                                            >
                                                <div className="flex items-center gap-2 md:gap-4">
                                                    {element.city && (
                                                        <div className="relative h-[48px] md:h-[60px] w-[48px] md:w-[60px] flex-shrink-0">
                                                            {element.city.logoImage ? (
                                                                <Image
                                                                    src={element.city.logoImage}
                                                                    alt={element.city.name}
                                                                    fill
                                                                    sizes="(max-width: 768px) 48px, 60px"
                                                                    style={{ objectFit: 'contain' }}
                                                                    priority
                                                                />
                                                            ) : (
                                                                <Building2 className="w-full h-full text-gray-400" />
                                                            )}
                                                        </div>
                                                    )}
                                                    <span className={cn(
                                                        "truncate",
                                                        element.city && "hidden md:inline"
                                                    )}>{element.name}</span>
                                                </div>
                                            </Link>
                                            {element.description && (
                                                <span className="text-xs md:text-sm text-muted-foreground truncate">
                                                    {element.description}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center gap-4 flex-shrink-0">
                            {children}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsSearchOpen(true)}
                                    className="flex items-center justify-center h-9 w-9 rounded-full hover:bg-accent transition-colors"
                                    title="Search"
                                >
                                    <Search className="h-4 w-4 text-muted-foreground" />
                                </button>
                                <UserDropdown currentEntity={currentEntity} />
                            </div>
                        </div>
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
                                <form onSubmit={handleSearch} className="relative p-4">
                                    <Search className="absolute left-7 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        ref={searchInputRef}
                                        type="text"
                                        placeholder="Αναζήτηση..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-9 h-12 text-base"
                                        autoFocus
                                    />
                                </form>
                                <div className="px-4 pb-4">
                                    <button
                                        onClick={handleChatClick}
                                        className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors flex justify-end underline decoration-1 underline-offset-4"
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
