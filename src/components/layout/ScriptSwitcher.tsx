"use client"

import { useEffect, useState } from "react"
import { useLocale } from "next-intl"
import { urlPrefixForLocale } from "@/i18n/config"
import { usePathname } from "@/i18n/routing"
import { realmForBrowser } from "@/lib/realm.client"
import { isSerbianLocale } from "@/lib/serbian"
import { cn } from "@/lib/utils"

/**
 * Ћир | Lat script toggle, rendered only for the Serbian realm. Serbian is
 * digraphic: the same content is served in Cyrillic (`sr`, the unprefixed
 * default on opencouncil.rs) or Latin (`sr-Latn`, under /lat).
 *
 * Deliberately plain anchors with a full navigation, not next-intl Links: the
 * Cyrillic target must be the UNPREFIXED URL (the proxy rewrites it on .rs),
 * which the router — whose app-wide default locale is el — would not produce,
 * and server-rendered content (metadata, RSC payloads) must re-render in the
 * new script anyway. Native anchors also keep modifier-clicks (open in new
 * tab) working.
 *
 * Visibility is derived from the active locale, which is identical on server
 * and client — no hydration mismatch. The post-mount effect covers what SSR
 * can't know: the current query string (preserved in the hrefs, e.g. ?t=
 * timestamps) and the edge of an explicit /en path on the Serbian host, where
 * the locale alone can't reveal the realm.
 */
export default function ScriptSwitcher({ className }: { className?: string }) {
    const locale = useLocale()
    const pathname = usePathname() // locale-less path, from the i18n routing helpers
    const [onSerbianHost, setOnSerbianHost] = useState(false)
    const [search, setSearch] = useState("")

    // No dependency array on purpose: the query string can change on client
    // navigations that don't remount this component. setState bails out when
    // the value is unchanged, so this settles immediately.
    useEffect(() => {
        setOnSerbianHost(realmForBrowser() === "serbia")
        setSearch(window.location.search)
    })

    if (!isSerbianLocale(locale) && !onSerbianHost) return null

    // On a non-Serbian locale (an explicit /en path on the Serbian host),
    // neither script is active — the toggle is then an entry point into
    // Serbian, not an indicator of the current one.
    const active: "sr" | "sr-Latn" | null = isSerbianLocale(locale) ? locale : null
    const latPrefix = `/${urlPrefixForLocale("sr-Latn")}`
    // The choice must ride in the URL, not an onClick cookie write: onClick
    // never fires for middle-click / open-in-new-tab, and with a stored
    // 'latn' cookie a bare unprefixed GET bounces straight back to /lat. The
    // Ћир href carries ?script=cyrl, which the proxy consumes into the
    // oc-script cookie (mirroring ?realm=). The Lat href needs no param: the
    // /lat prefix wins over any cookie, and visiting it persists 'latn'.
    const hrefFor = (target: "sr" | "sr-Latn") => {
        if (target === "sr-Latn") {
            const path = pathname === "/" ? latPrefix : `${latPrefix}${pathname}`
            return `${path}${search}`
        }
        const params = new URLSearchParams(search)
        params.set("script", "cyrl")
        return `${pathname || "/"}?${params.toString()}`
    }

    const linkClass = (target: "sr" | "sr-Latn") =>
        cn(
            "transition-colors",
            target === active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-primary",
        )

    return (
        <div className={cn("inline-flex items-center gap-1.5 text-xs whitespace-nowrap", className)}>
            {/* nofollow: the ?script=cyrl href is a crawlable twin of every
                page — the cookie 302 means nothing to a cookieless crawler. */}
            <a href={hrefFor("sr")} rel="nofollow" className={linkClass("sr")} aria-label="Ћирилица" aria-current={active === "sr" ? "true" : undefined}>
                Ћир
            </a>
            <span className="text-muted-foreground/40" aria-hidden="true">|</span>
            <a href={hrefFor("sr-Latn")} className={linkClass("sr-Latn")} aria-label="Latinica" aria-current={active === "sr-Latn" ? "true" : undefined}>
                Lat
            </a>
        </div>
    )
}
