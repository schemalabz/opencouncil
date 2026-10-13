"use client";

import type { MouseEvent, ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/* The consultation's screens share one small visual language: a warm stone ground, white cards,
 * one orange call to action per screen, and a coloured dot for every kind of place.
 *
 * Five text sizes: 13px for meta, 15px for secondary text, 17px for body text and buttons, 20px
 * for a heading, 30px for the title (plus 12px for an uppercase section label). Three radii:
 * 16px for a card, 12px for a button or a field, round for a chip. */

export const pageClass = "min-h-full bg-stone-100 text-stone-900";
export const cardClass = "rounded-2xl border border-stone-200 bg-white";
export const primaryButtonClass = "flex min-h-12 w-full items-center justify-center rounded-xl bg-[#c2410c] px-4 py-2.5 text-center text-[17px] font-bold leading-snug text-white transition-colors hover:bg-[#9a3412] disabled:opacity-60";
export const secondaryButtonClass = "flex min-h-12 w-full items-center justify-center rounded-xl border-[1.5px] border-stone-300 bg-white px-4 py-2.5 text-center text-[17px] font-semibold leading-snug text-stone-900 transition-colors hover:bg-stone-50";
export const smallActionClass = "shrink-0 rounded-xl border-[1.5px] border-[#c2410c] px-3 py-2 text-[15px] font-semibold text-[#9a3412] transition-colors hover:bg-[#fff7ed]";
export const inputClass = "h-12 w-full rounded-xl border-[1.5px] border-stone-300 bg-white px-4 text-[17px] text-stone-900 focus:border-[#c2410c] focus:outline-none";
export const textareaClass = "w-full resize-none rounded-xl border-[1.5px] border-stone-300 bg-white px-4 py-3 text-[17px] leading-relaxed text-stone-900 focus:border-[#c2410c] focus:outline-none";
/**
 * The site's stylesheet centres every `h2` outside `.prose` at 24px, and its selector outranks a
 * utility class. A heading here resets that; its size then needs `!` too (`!text-xl`).
 */
export const headingClass = "!text-left !font-bold !leading-tight";
export const textLinkClass = "font-semibold text-[#9a3412] underline-offset-2 hover:underline";

/**
 * Moves between the consultation's screens. A screen is only a query string (`?view=street`), so
 * the history API changes it without a server round trip: Next.js keeps `useSearchParams` in sync,
 * and the page does not fetch the regulation again on every tap.
 */
export function navigateTo(href: string, { replace = false }: { replace?: boolean } = {}) {
    if (replace) window.history.replaceState(null, '', href);
    else window.history.pushState(null, '', href);
}

/** A link to another screen of the consultation; `href` is a query string such as `?view=map&entity=x`. */
export function ViewLink({ href, className, children, onClick, ...rest }: {
    href: string;
    className?: string;
    children: ReactNode;
    onClick?: () => void;
    'aria-label'?: string;
    title?: string;
}) {
    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
        // A modified click opens a new tab or window: let the browser do that.
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onClick?.();
        navigateTo(href);
    };
    return <a href={href} className={className} onClick={handleClick} {...rest}>{children}</a>;
}

export function Dot({ color, className }: { color?: string; className?: string }) {
    return <span aria-hidden="true" className={cn("inline-block h-3 w-3 shrink-0 rounded-full", className)} style={{ backgroundColor: color ?? '#78716c' }} />;
}

export function SectionLabel({ children }: { children: ReactNode }) {
    return <h2 className={cn(headingClass, "px-1 pt-2 !text-xs uppercase tracking-wider text-stone-600")}>{children}</h2>;
}

/** A screen's top bar: a back link and the screen's title. */
export function ViewHeader({ backHref, eyebrow, title }: { backHref: string; eyebrow?: string; title: string }) {
    return (
        <div className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-3">
            <ViewLink
                href={backHref}
                aria-label="Πίσω"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-900 transition-colors hover:bg-stone-200"
            >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </ViewLink>
            <div className="min-w-0">
                {eyebrow && <div className="text-[13px] text-stone-600">{eyebrow}</div>}
                <h1 className="truncate text-xl font-bold leading-tight">{title}</h1>
            </div>
        </div>
    );
}

/** One row of a white list card that links somewhere. */
export function LinkRow({ href, children, badge, className }: { href: string; children: ReactNode; badge?: ReactNode; className?: string }) {
    return (
        <ViewLink href={href} className={cn("flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-4 text-[17px] text-stone-900 last:border-b-0 hover:bg-stone-50", className)}>
            <span>{children}</span>
            <span className="flex items-center gap-2 text-stone-500">
                {badge}
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
        </ViewLink>
    );
}

/** The platform's own line: OpenCouncil runs this page, not the municipality. */
export function OpenCouncilCredit() {
    return (
        <p className="px-1 text-[13px] leading-relaxed text-stone-500">
            Η σελίδα λειτουργεί με την <Link href="/about" className="underline underline-offset-2">OpenCouncil</Link>.
        </p>
    );
}
