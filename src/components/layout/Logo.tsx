import Image from 'next/image'
import { Link } from '@/i18n/routing';
import { cn } from "@/lib/utils"

const Logo = () => {
    return (
        <Link href="/" className={cn("flex items-center space-x-2")}>
            <Image
                src="/logo.png"
                alt="OpenCouncil Logo"
                width={24}
                height={24}
            />
            <span className="text-2xl font-bold text-primary">OpenCouncil</span>
        </Link>
    )
}

export default Logo
