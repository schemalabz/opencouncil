"use client"

import { Globe, ChevronDown } from "lucide-react"
import { Realm } from "@prisma/client"
import { ALL_REALMS, REALMS, getRealmBaseUrl, getRealmDisplayName } from "@/lib/realm"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Country names shown in their own language (endonyms): the display name of
// each realm's country in that realm's own default locale.
const countryLabel = (realm: Realm) => getRealmDisplayName(realm, REALMS[realm].defaultLocale)

/**
 * Small footer control showing the current country with a dropdown to switch to
 * the other realm's domain. The realm comes from the server-rendered footer, so
 * the label is correct in the first paint; selecting another country navigates
 * to that domain's root (content differs across realms, so the current path may
 * not exist there).
 */
export default function CountrySwitcher({ realm }: { realm: Realm }) {

    function switchTo(target: Realm) {
        if (target === realm) return
        window.location.href = getRealmBaseUrl(target)
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors focus:outline-none">
                <Globe className="w-3.5 h-3.5" />
                <span>{countryLabel(realm)}</span>
                <ChevronDown className="w-3 h-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="min-w-[8rem]">
                {ALL_REALMS.map((r) => (
                    <DropdownMenuItem
                        key={r}
                        onClick={() => switchTo(r)}
                        className={r === realm ? "font-medium" : undefined}
                    >
                        {countryLabel(r)}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
