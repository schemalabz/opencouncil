"use client"
import Image from 'next/image'
import { Link } from '@/i18n/routing';
import { cn } from "@/lib/utils"

const Logo = ({ className }: { className?: string }) => {
    return (
        <Link href="/" className={cn("flex items-center", className)}>
            <Image
                src="/logo.png"
                alt="OpenCouncil Logo"
                width={48}
                height={48}
            />
            <span className="text-2xl text-primary">OpenCouncil</span>
        </Link>
    )
}

export default Logo
