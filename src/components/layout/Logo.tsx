"use client"
import Image from 'next/image'
import { Link } from '@/i18n/routing';
import { cn } from "@/lib/utils"

interface LogoProps {
    className?: string;
    imageClassName?: string;
    textClassName?: string;
    hideText?: boolean;
}

const Logo = ({ className, imageClassName, textClassName, hideText = false }: LogoProps) => {
    return (
        <Link href="/" className={cn("flex items-center", className)}>
            <div className={cn("relative w-12 h-12", imageClassName)}>
                <Image
                    src="/logo.png"
                    alt="OpenCouncil Logo"
                    fill
                    sizes="(max-width: 768px) 40px, 48px, 128px"
                    style={{ objectFit: 'contain' }}
                    className="transition-transform"
                    priority
                />
            </div>
            {!hideText && (
                <span className={cn("text-2xl text-primary", textClassName)}>OpenCouncil</span>
            )}
        </Link>
    )
}

export default Logo
