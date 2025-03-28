"use client"
import { cn } from "@/lib/utils"
import { Link } from '@/i18n/routing'
import { useLocale } from 'next-intl'
import Image from 'next/image'
import UserDropdown from "./user-dropdown"
import { motion, useScroll, useTransform } from 'framer-motion'
import { SidebarTrigger } from '../ui/sidebar'
import { City } from '@prisma/client'
import { Separator } from "@/components/ui/separator"

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
                    <div className="flex items-stretch gap-2 md:gap-4 z-10 h-full">
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
                            {path.length === 0 && (
                                <span className="text-lg md:text-xl md:hidden">OpenCouncil</span>
                            )}
                        </Link>
                    </div>

                    {path.length === 0 && (
                        <div className="absolute left-0 right-0 hidden md:flex justify-center items-center pointer-events-none">
                            <Link href="/" className="pointer-events-auto hover:no-underline">
                                <span className="text-xl font-medium">OpenCouncil</span>
                            </Link>
                        </div>
                    )}

                    {path.length > 0 && <Separator orientation="vertical" className="h-12 mx-2 md:mx-6" />}

                    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center flex-1 min-w-0">
                            {path.map((element, index) => (
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
                                                        <Image
                                                            src={element.city.logoImage || '/logo.png'}
                                                            alt={element.city.name}
                                                            fill
                                                            sizes="(max-width: 768px) 48px, 60px"
                                                            style={{ objectFit: 'contain' }}
                                                            priority
                                                        />
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
                        <UserDropdown currentEntity={currentEntity} />
                    </div>
                </div>
            ) : (
                <div className="container mx-auto h-full">
                    <div className="flex items-center w-full px-4 relative h-full">
                        <div className="flex items-stretch gap-2 md:gap-4 z-10 h-full">
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
                                {path.length === 0 && (
                                    <span className="text-lg md:text-xl md:hidden">OpenCouncil</span>
                                )}
                            </Link>
                        </div>

                        {path.length === 0 && (
                            <div className="absolute left-0 right-0 hidden md:flex justify-center items-center pointer-events-none">
                                <Link href="/" className="pointer-events-auto hover:underline">
                                    <span className="text-xl font-medium">OpenCouncil</span>
                                </Link>
                            </div>
                        )}

                        {path.length > 0 && <Separator orientation="vertical" className="h-12 mx-2 md:mx-6" />}

                        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                            <div className="flex items-center flex-1 min-w-0">
                                {path.map((element, index) => (
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
                                                            <Image
                                                                src={element.city.logoImage || '/logo.png'}
                                                                alt={element.city.name}
                                                                fill
                                                                sizes="(max-width: 768px) 48px, 60px"
                                                                style={{ objectFit: 'contain' }}
                                                                priority
                                                            />
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
                            <UserDropdown currentEntity={currentEntity} />
                        </div>
                    </div>
                </div>
            )}
        </motion.header>
    )
}

export default Header
