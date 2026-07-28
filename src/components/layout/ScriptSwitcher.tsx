"use client"

import { useEffect, useState } from "react"
import { useLocale } from "next-intl"
import { usePathname } from "@/i18n/routing"
import { realmForHost } from "@/lib/realm"
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
        setOnSerbianHost(realmForHost(window.location.hostname) === "serbia")
        setSearch(window.location.search)
    })

    if (!isSerbianLocale(locale) && !onSerbianHost) return null

    // On a non-Serbian locale (an explicit /en path on the Serbian host),
    // neither script is active — the toggle is then an entry point into
    // Serbian, not an indicator of the current one.
    const active: "sr" | "sr-Latn" | null = isSerbianLocale(locale) ? (locale === "sr-Latn" ? "sr-Latn" : "sr") : null
    const hrefFor = (target: "sr" | "sr-Latn") => {
        const path = target === "sr" ? pathname || "/" : pathname === "/" ? "/lat" : `/lat${pathname}`
        return `${path}${search}`
    }

    const linkClass = (target: "sr" | "sr-Latn") =>
        cn(
            "transition-colors",
            target === active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-primary",
        )

    return (
        <div className={cn("inline-flex items-center gap-1.5 text-xs whitespace-nowrap", className)}>
            <a href={hrefFor("sr")} className={linkClass("sr")} aria-label="Ћирилица" aria-current={active === "sr" ? "true" : undefined}>
                Ћир
            </a>
            <span className="text-muted-foreground/40" aria-hidden="true">|</span>
            <a href={hrefFor("sr-Latn")} className={linkClass("sr-Latn")} aria-label="Latinica" aria-current={active === "sr-Latn" ? "true" : undefined}>
                Lat
            </a>
        </div>
    )
}
