'use client'

import { useSession } from "next-auth/react"
import { useTranslations, useLocale } from "next-intl"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LogOut, LogIn, ShieldCheck } from "lucide-react"
import { useAccountLinks } from "./account-links"
import { signOut } from "next-auth/react"
// The locale-aware router: next/navigation's would push a bare "/sign-in",
// dropping the locale prefix and landing the user on the Greek sign-in page.
import { Link, useRouter } from "@/i18n/routing"
import { Skeleton } from "@/components/ui/skeleton"
// @ts-ignore
import klitiki from "greek-name-klitiki"
import { useEffect, useState } from "react"
import { isUserAuthorizedToEdit } from "@/lib/auth"

export default function UserDropdown({ currentEntity }: { currentEntity?: { cityId: string } }) {
    const { data: session, status } = useSession()
    const t = useTranslations("Header")
    const tAccount = useTranslations("account")
    const accountLinks = useAccountLinks()
    const locale = useLocale()
    const router = useRouter()
    const [canEdit, setCanEdit] = useState(false);

    useEffect(() => {
        const checkEditPermissions = async () => {
            if (currentEntity?.cityId && session?.user) {
                const hasPermission = await isUserAuthorizedToEdit(currentEntity);
                setCanEdit(hasPermission);
            }
        };
        checkEditPermissions();
    }, [currentEntity?.cityId, session?.user, currentEntity]);

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
                <span className="hidden md:inline">{t("login")}</span>
            </Button>
        )
    }
    const firstName = session.user.name?.split(" ")[0]
    // klitiki produces the Greek vocative case; only meaningful for el, so other
    // locales greet with the plain first name.
    const greeting = firstName
        ? t("greetingNamed", { name: locale === "el" ? klitiki(firstName) : firstName })
        : t("greeting")

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative cursor-pointer hover:text-accent">
                    <span className="hidden md:inline">
                        {greeting}
                    </span>
                    {canEdit && <ShieldCheck className="h-4 w-4 ml-4 text-blue-500" />}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end">
                <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1 items-center">
                        <p className="text-sm font-medium leading-none">{t("account")}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                            {session.user.email}
                        </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {canEdit && <><DropdownMenuLabel>
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <ShieldCheck className="h-8 w-8 text-blue-500" />
                        <span className="text-xs font-normal text-left">{t("canEditPage")}</span>
                    </div>
                </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                </>}

                {accountLinks.map(({ href, labelKey, icon: Icon }) => (
                    <DropdownMenuItem key={href} asChild>
                        <Link href={href} className="cursor-pointer">
                            <Icon className="mr-2 h-4 w-4" />
                            {tAccount(labelKey)}
                        </Link>
                    </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                    className="text-red-600 focus:text-red-600 cursor-pointer"
                    onClick={() => signOut()}
                >
                    <LogOut className="mr-2 h-4 w-4" />
                    {tAccount("signOut")}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
