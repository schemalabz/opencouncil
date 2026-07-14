"use client";

import { useEffect, useState } from "react";
import { ArrowUp, ArrowRight } from "lucide-react";

interface Section {
    id: string;
    title: string;
}

/**
 * Client-side reading enhancements for the single-page /explain guide:
 *  - scroll-spy that tracks the section in view (server-rendered sections stay
 *    fully indexable);
 *  - keeps the URL hash in sync with the active section (/explain#<id>) so any
 *    section is deep-linkable and shareable;
 *  - highlights the matching link in the sticky desktop table of contents;
 *  - renders the mobile prev/next navigator fixed to the bottom of the screen.
 */
export function ExplainReader({ sections }: { sections: Section[] }) {
    const [active, setActive] = useState(-1);
    // Title of the section the reader has scrolled *past* — shown as a sticky bar
    // on mobile so the current subtitle stays visible while reading the content.
    const [stickyTitle, setStickyTitle] = useState<string | null>(null);

    // Track the section in view and pin the desktop table of contents.
    useEffect(() => {
        const els = sections.map((s) => document.getElementById(s.id));
        const aside = document.querySelector<HTMLElement>("[data-toc]");
        const grid = aside?.parentElement ?? null;
        const OFFSET = 120; // spy threshold, below the fixed header
        const PIN_TOP = 96; // where the ToC pins (matches the header offset)
        const LG = 1024;
        let raf = 0;

        const compute = () => {
            raf = 0;

            // scroll-spy: last section whose top has passed the threshold
            let idx = -1;
            for (let i = 0; i < els.length; i++) {
                const el = els[i];
                if (el && el.getBoundingClientRect().top <= OFFSET) idx = i;
            }
            setActive(idx);

            // show the sticky subtitle only once its heading has scrolled off the top
            const activeEl = idx >= 0 ? els[idx] : null;
            const passed = activeEl ? activeEl.getBoundingClientRect().top < 0 : false;
            // the Substack "further reading" section shouldn't pin its title
            const show = idx >= 0 && passed && sections[idx].id !== "substack";
            setStickyTitle(show ? sections[idx].title : null);

            // pin the ToC: position: sticky is broken by an overflow-hidden
            // ancestor, so translate it to hold PIN_TOP while it's in range.
            if (aside && grid) {
                if (window.innerWidth < LG) {
                    aside.style.transform = "";
                } else {
                    const gridTop = grid.getBoundingClientRect().top;
                    const max = Math.max(0, grid.offsetHeight - aside.offsetHeight);
                    const t = Math.min(Math.max(0, PIN_TOP - gridTop), max);
                    aside.style.transform = `translateY(${t}px)`;
                }
            }
        };
        const onScroll = () => {
            if (!raf) raf = requestAnimationFrame(compute);
        };

        compute();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
            if (raf) cancelAnimationFrame(raf);
            if (aside) aside.style.transform = "";
        };
    }, [sections]);

    // Reflect the active section in the ToC (aria-current) and the URL hash.
    useEffect(() => {
        const activeId = active >= 0 ? sections[active].id : null;
        const isSub = activeId?.startsWith("oc-") ?? false;

        const links = document.querySelectorAll<HTMLAnchorElement>("[data-toc] a");
        links.forEach((a) => {
            const href = a.getAttribute("href");
            // Highlight the active link; while a sub-section is active, also keep the
            // parent "Πως δουλεύει το OpenCouncil;" entry highlighted.
            const on =
                (activeId != null && href === `#${activeId}`) || (isSub && href === "#opencouncil");
            if (on) a.setAttribute("aria-current", "true");
            else a.removeAttribute("aria-current");
        });

        // Expand the nested OpenCouncil group once it (or one of its sub-sections)
        // is in view; collapse it otherwise.
        const group = document.querySelector("[data-toc-group]");
        if (group) {
            if (activeId === "opencouncil" || isSub) group.setAttribute("data-expanded", "true");
            else group.removeAttribute("data-expanded");
        }

        if (active >= 0) {
            const hash = `#${sections[active].id}`;
            if (window.location.hash !== hash) {
                window.history.replaceState(null, "", hash);
            }
        } else if (window.location.hash) {
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }
    }, [active, sections]);

    const go = (id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const next = active >= 0 && active < sections.length - 1 ? sections[active + 1] : null;

    // Only surfaces once the reader is inside an article.
    if (active < 0) return null;

    return (
        <>
            {stickyTitle && (
                <div className="fixed inset-x-0 top-0 z-30 bg-background/95 backdrop-blur lg:hidden">
                    <div className="mx-auto max-w-6xl px-4 py-2.5">
                        <span className="!text-left text-2xl !leading-none">
                            {stickyTitle}
                        </span>
                    </div>
                </div>
            )}

            <nav
                aria-label="Πλοήγηση άρθρων"
                className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur lg:hidden"
            >
            <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2">
                <button
                    type="button"
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                    aria-label="Πάνω"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange text-white transition-colors hover:bg-orange/90"
                >
                    <ArrowUp className="h-5 w-5" />
                </button>
                {next ? (
                    <button
                        type="button"
                        onClick={() => go(next.id)}
                        className="flex min-w-0 flex-1 flex-row-reverse items-center gap-2 px-1 py-2 text-right"
                    >
                        <ArrowRight className="h-5 w-5 shrink-0 text-orange" />
                        <span className="min-w-0">
                            <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
                                Επόμενο
                            </span>
                            <span className="block text-sm font-semibold leading-tight [overflow-wrap:anywhere]">
                                {next.title}
                            </span>
                        </span>
                    </button>
                ) : (
                    <span className="flex-1" />
                )}
            </div>
            </nav>
        </>
    );
}
