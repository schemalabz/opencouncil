'use client'

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { User, LogOut, LogIn } from "lucide-react"
import { signOut } from "next-auth/react"
import { Link } from "@/i18n/routing"
import { Skeleton } from "@/components/ui/skeleton"

export default function UserDropdown() {
    const { data: session, status } = useSession()
    const router = useRouter()

    if (status === "loading") {
        return (
            <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-9 rounded-full" />
                <Skeleton className="h-4 w-24 md:block hidden" />
            </div>
        )
    }

    if (!session?.user) {
        return (
            <Button variant="link" onClick={() => router.push('/sign-in')} className="cursor-pointer text-muted-foreground hover:text-foreground">
                <LogIn className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Σύνδεση</span>
            </Button>
        )
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative cursor-pointer">
                    <User className="h-5 w-5 md:mr-2" />
                    <span className="hidden md:inline">
                        {session.user.name || "Συνδεδεμένος"}
                    </span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end">
                <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">Λογαριασμός</p>
                        <p className="text-xs leading-none text-muted-foreground">
                            {session.user.email}
                        </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link href="/profile" className="cursor-pointer">
                        <User className="mr-2 h-4 w-4" />
                        Προφίλ
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                    className="text-red-600 focus:text-red-600 cursor-pointer"
                    onClick={() => signOut()}
                >
                    <LogOut className="mr-2 h-4 w-4" />
                    Αποσύνδεση
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
