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
}
const Header = ({ path, showSidebarTrigger = false, currentEntity, children, noContainer = false }: HeaderProps) => {
    const { scrollY } = useScroll();
    const borderOpacity = useTransform(scrollY, [0, 10], [0, 1], { clamp: true });

    return (
        <motion.header
            className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex justify-between items-center min-h-[80px] relative"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
        >
            <motion.div
                className="absolute bottom-0 left-0 right-0 h-[1px] bg-border"
                style={{ opacity: borderOpacity }}
            />
            {noContainer ? (
                <div className="flex items-center w-full px-4">
                    <div className="flex items-center gap-2 md:gap-4">
                        {showSidebarTrigger && <SidebarTrigger />}
                        <Link href="/" className="flex items-center gap-2 md:gap-3 shrink-0">
                            <Image width={40} height={40} className="md:w-[48px] md:h-[48px]" src='/logo.png' alt='logo' />
                            {path.length === 0 && (
                                <span className="text-lg md:text-xl">OpenCouncil</span>
                            )}
                        </Link>
                    </div>

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
                                                    <div className="h-[48px] md:h-[60px] flex-shrink-0">
                                                        <Image
                                                            src={element.city.logoImage || '/logo.png'}
                                                            height={60}
                                                            width={200}
                                                            style={{ height: '100%', width: 'auto' }}
                                                            alt={element.city.name}
                                                            className="h-full w-auto"
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
                <div className="container mx-auto">
                    <div className="flex items-center w-full px-4">
                        <div className="flex items-center gap-2 md:gap-4">
                            {showSidebarTrigger && <SidebarTrigger />}
                            <Link href="/" className="flex items-center gap-2 md:gap-3 shrink-0">
                                <Image width={40} height={40} className="md:w-[48px] md:h-[48px]" src='/logo.png' alt='logo' />
                                {path.length === 0 && (
                                    <span className="text-lg md:text-xl">OpenCouncil</span>
                                )}
                            </Link>
                        </div>

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
                                                        <div className="h-[48px] md:h-[60px] flex-shrink-0">
                                                            <Image
                                                                src={element.city.logoImage || '/logo.png'}
                                                                height={60}
                                                                width={200}
                                                                style={{ height: '100%', width: 'auto' }}
                                                                alt={element.city.name}
                                                                className="h-full w-auto"
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
                </div>
            )}
        </motion.header>
    )
}

export default Header
