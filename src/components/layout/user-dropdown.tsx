'use client'

import { useSession, signOut } from "next-auth/react"
import { useTranslations, useLocale } from "next-intl"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Bot, HelpCircle, LogIn, LogOut, Pencil } from "lucide-react"
import { useAccountLinks } from "./account-links"
// The locale-aware router: next/navigation's would push a bare "/sign-in",
// dropping the locale prefix and landing the user on the Greek sign-in page.
import { Link, useRouter } from "@/i18n/routing"
import { Skeleton } from "@/components/ui/skeleton"
// @ts-ignore
import klitiki from "greek-name-klitiki"
import { useEffect, useState } from "react"
import { isUserAuthorizedToEdit } from "@/lib/actions/auth"
import { getInitials } from "@/lib/formatters/name"
import { cn } from "@/lib/utils"
import { headerControlClass } from "./headerControl"
import ScriptSwitcher from "./ScriptSwitcher"

interface UserDropdownProps {
    currentEntity?: { cityId: string }
    /** What the edit right is over, named — the city whose page this is. */
    entityLabel?: string
    /** Offer the /explain guide; the page 404s outside the Greek realm. */
    showExplain?: boolean
}

/**
 * The account control — the one place in the header that is about *you*.
 *
 * It is always an avatar, at every width. The greeting keeps its place from
 * `md`, where there is room for it, but it is no longer the only thing the
 * control renders: below `md` the greeting was hidden and a reader with no
 * edit rights got a button with nothing in it at all.
 *
 * Rarely-used app-wide entries (MCP, the guide, the script switch) live in this
 * menu rather than in the bar. Both are things a reader looks for once; a menu
 * can name them, and a 16px icon in a phone header cannot.
 */
export default function UserDropdown({ currentEntity, entityLabel, showExplain = false }: UserDropdownProps) {
    const { data: session, status } = useSession()
    const t = useTranslations("Header")
    const tAccount = useTranslations("account")
    const accountLinks = useAccountLinks()
    const locale = useLocale()
    const router = useRouter()
    const [canEdit, setCanEdit] = useState(false);

    const cityId = currentEntity?.cityId;
    const userId = session?.user?.id;

    useEffect(() => {
        if (!cityId || !userId) {
            // Reset, don't just skip: without this a `true` from the last city
            // survived both a sign-out and a move to a page with no entity, so
            // the badge claimed rights the viewer no longer had.
            setCanEdit(false);
            return;
        }
        let current = true;
        // Depends on cityId and userId rather than on the objects holding them:
        // `currentEntity` is an object literal from the parent, so depending on
        // it re-ran this server action on every parent render.
        isUserAuthorizedToEdit({ cityId })
            .then(allowed => { if (current) setCanEdit(allowed); })
            .catch(() => { if (current) setCanEdit(false); });
        return () => { current = false; };
    }, [cityId, userId]);

    const triggerClass = cn(
        headerControlClass,
        // The avatar is the last thing in the header, so the greeting reads into
        // it rather than out of it.
        'cursor-pointer pr-1 md:pl-3',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30',
    );

    // MCP, the guide and the script switch: app-wide, rarely wanted, and named
    // here rather than shown as unlabelled icons in a phone-width bar.
    const appLinks = (
        <>
            <DropdownMenuItem asChild>
                <Link href="/mcp" className="cursor-pointer">
                    <Bot className="mr-2 h-4 w-4" />
                    {t("mcp")}
                </Link>
            </DropdownMenuItem>
            {showExplain && (
                <DropdownMenuItem asChild>
                    <Link href="/explain" className="cursor-pointer">
                        <HelpCircle className="mr-2 h-4 w-4 text-[hsl(var(--orange))]" />
                        {t("explainShort")}
                    </Link>
                </DropdownMenuItem>
            )}
            {/* Renders nothing outside the Serbian realm. */}
            <ScriptSwitcher className="px-2 py-1.5" />
        </>
    );

    if (status === "loading") {
        return (
            <div className="flex items-center gap-2">
                <Skeleton className="hidden h-4 w-28 md:block" />
                <Skeleton className="h-8 w-8 rounded-full" />
            </div>
        )
    }

    // Signed out the control still opens a menu rather than jumping straight to
    // sign-in: MCP, the guide and the script switch moved in here out of the bar,
    // and a visitor must not lose them for want of an account.
    if (!session?.user) {
        return (
            <DropdownMenu>
                <DropdownMenuTrigger className={triggerClass} aria-label={t("login")}>
                    <span className="hidden md:inline text-sm">{t("login")}</span>
                    <Avatar name={null} imageUrl={null} />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64" align="end">
                    <DropdownMenuItem className="cursor-pointer font-medium" onClick={() => router.push('/sign-in')}>
                        <LogIn className="mr-2 h-4 w-4" />
                        {t("login")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {appLinks}
                </DropdownMenuContent>
            </DropdownMenu>
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
            <DropdownMenuTrigger className={triggerClass} aria-label={greeting}>
                <span className="hidden md:inline text-sm">{greeting}</span>
                <Avatar name={session.user.name ?? null} imageUrl={session.user.image ?? null} canEdit={canEdit} />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64" align="end">
                <DropdownMenuLabel className="font-normal">
                    <span className="block truncate text-sm font-medium">{session.user.name ?? t("account")}</span>
                    <span className="block truncate text-xs text-muted-foreground">{session.user.email}</span>
                </DropdownMenuLabel>

                {/* What the badge on the avatar means, in words. The name sits on
                    its own line rather than inside the sentence: the label would
                    otherwise have to decline it, and `Αθήνα` arrives nominative. */}
                {canEdit && (
                    <div className="mx-1 mb-1 flex items-start gap-2.5 rounded-[8px] bg-[hsl(var(--orange))]/[0.07] px-2.5 py-2">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--orange))]">
                            <Pencil className="h-3 w-3 text-white" aria-hidden />
                        </span>
                        <span className="min-w-0">
                            <span className="block text-[13px] font-medium leading-snug">
                                {entityLabel ? t("canEdit") : t("canEditPage")}
                            </span>
                            {entityLabel && (
                                <span className="block truncate text-[13px] font-semibold leading-snug">{entityLabel}</span>
                            )}
                            <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{t("canEditHint")}</span>
                        </span>
                    </div>
                )}

                <DropdownMenuSeparator />
                {accountLinks.map(({ href, labelKey, icon: Icon }) => (
                    <DropdownMenuItem key={href} asChild>
                        <Link href={href} className="cursor-pointer">
                            <Icon className="mr-2 h-4 w-4" />
                            {tAccount(labelKey)}
                        </Link>
                    </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator />
                {appLinks}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                    className="cursor-pointer text-red-600 focus:text-red-600"
                    onClick={() => signOut()}
                >
                    <LogOut className="mr-2 h-4 w-4" />
                    {tAccount("signOut")}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

/**
 * You, as a 32px disc — initials, or an outline when signed out.
 *
 * `canEdit` adds a pencil badge rather than a second control in the bar. A
 * pencil and not a shield: a shield reads as protection, where the fact being
 * shown is that this viewer can change what is on screen — the same pencil that
 * opens editing on a meeting.
 */
function Avatar({ name, imageUrl, canEdit = false }: { name: string | null; imageUrl: string | null; canEdit?: boolean }) {
    return (
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
            {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : name ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-[13px] font-semibold text-background">
                    {getInitials(name)}
                </span>
            ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-border text-muted-foreground">
                    <UserGlyph />
                </span>
            )}
            {canEdit && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-[15px] w-[15px] items-center justify-center rounded-full border-2 border-background bg-[hsl(var(--orange))]">
                    <Pencil className="h-[7px] w-[7px] text-white" aria-hidden />
                </span>
            )}
        </span>
    )
}

function UserGlyph() {
    return (
        <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
    )
}
