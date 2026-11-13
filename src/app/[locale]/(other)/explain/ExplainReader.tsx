"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, List } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { TocTree, type TocGroup, type TocSection as Section } from "@/components/explain/TocTree";

/** The drawer's "top of the page" target. */
const TOP = "__top__";

/**
 * Client-side reading enhancements for the single-page /explain guide:
 *  - scroll-spy that tracks the section in view (server-rendered sections stay
 *    fully indexable);
 *  - keeps the URL hash in sync with the active section (/explain#<id>) so any
 *    section is deep-linkable and shareable;
 *  - highlights the matching link in the sticky desktop table of contents;
 *  - renders the mobile navigator fixed to the bottom of the screen: previous
 *    and next section, and a button that opens the full table of contents.
 */
export function ExplainReader({
    sections,
    groups,
    sectionParents,
    mainTitle,
}: {
    sections: Section[];
    /** The table of contents, for the mobile drawer. */
    groups: TocGroup[];
    /** Section id → its top-level part title, shown above the sticky subtitle. */
    sectionParents?: Record<string, string>;
    /** Page main title — the fallback shown above top-level parts that have no parent. */
    mainTitle?: string;
}) {
    const [active, setActive] = useState(-1);
    // Index of the section the reader has scrolled *past* — shown as a sticky bar
    // on mobile so the current subtitle stays visible while reading the content.
    const [stickyIdx, setStickyIdx] = useState(-1);

    // Track the section in view. The ToC itself pins with CSS position: sticky.
    useEffect(() => {
        const els = sections.map((s) => document.getElementById(s.id));
        const OFFSET = 120; // spy threshold, below the fixed header
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
            setStickyIdx(show ? idx : -1);
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
        };
    }, [sections]);

    // Reflect the active section in the ToC (aria-current) and the URL hash.
    useEffect(() => {
        const activeId = active >= 0 ? sections[active].id : null;

        const links = document.querySelectorAll<HTMLAnchorElement>("[data-toc] a");
        links.forEach((a) => a.removeAttribute("aria-current"));

        if (activeId) {
            const activeLink = document.querySelector<HTMLElement>(`[data-toc] a[href="#${activeId}"]`);
            activeLink?.setAttribute("aria-current", "true");
            // keep the parent top-level group ("Οι ελληνικοί δήμοι" / "Πώς δουλεύει…")
            // highlighted while any of its sections is active
            activeLink
                ?.closest("[data-toc-group]")
                ?.querySelector("[data-toc-grouphead]")
                ?.setAttribute("aria-current", "true");
            // and the section whose parts are listed under it ("Η τεχνητή νοημοσύνη…")
            activeLink
                ?.closest("[data-toc-subgroup]")
                ?.querySelector("[data-toc-subhead]")
                ?.setAttribute("aria-current", "true");

            // The pinned column scrolls its own content on a short screen, so the
            // active entry can sit outside it. Move the column to the entry, and
            // move nothing else: scrollIntoView walks every scrollable ancestor,
            // and on this sticky box it drags the page instead of the column.
            //
            // Stop at the neighbour past the active entry, so the entry the reader
            // wants never sits flush against the edge of the column. Entries wrap
            // to two lines, so their heights differ and a fixed margin would cut a
            // wrapped neighbour in half.
            const aside = activeLink?.closest<HTMLElement>("[data-toc]");
            if (aside && activeLink) {
                const entries = [...aside.querySelectorAll<HTMLElement>("a")];
                const i = entries.indexOf(activeLink);
                const box = aside.getBoundingClientRect();
                const link = activeLink.getBoundingClientRect();
                if (link.top < box.top) {
                    const lead = (i > 0 ? entries[i - 1] : null) ?? activeLink;
                    aside.scrollTop += lead.getBoundingClientRect().top - box.top;
                } else if (link.bottom > box.bottom) {
                    const lead = (i >= 0 ? entries[i + 1] : null) ?? activeLink;
                    aside.scrollTop += lead.getBoundingClientRect().bottom - box.bottom;
                }
            }
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

    const [tocOpen, setTocOpen] = useState(false);
    const tocListRef = useRef<HTMLDivElement>(null);

    // Open on the entry the reader is at, not at the top of the list.
    useEffect(() => {
        if (!tocOpen) return;
        const frame = requestAnimationFrame(() => {
            const list = tocListRef.current;
            const link = list?.querySelector<HTMLElement>('a[aria-current="true"]');
            if (list && link) list.scrollTop = link.offsetTop - list.clientHeight / 2;
        });
        return () => cancelAnimationFrame(frame);
    }, [tocOpen]);

    // Close first, scroll once the drawer has let go of the page. While it is
    // open, vaul pins the body (position: fixed), so a scroll does nothing;
    // as it closes, vaul unpins the body and, one frame later, puts the page
    // scroll back where it was. Wait for the unpin, then two frames.
    const goFromToc = (id: string) => {
        setTocOpen(false);
        const started = performance.now();
        const scroll = () => {
            if (id === TOP) window.scrollTo({ top: 0, behavior: "smooth" });
            else go(id);
        };
        const tick = () => {
            const pinned = document.body.style.position === "fixed";
            if (pinned && performance.now() - started < 3000) {
                requestAnimationFrame(tick);
                return;
            }
            requestAnimationFrame(() => requestAnimationFrame(scroll));
        };
        requestAnimationFrame(tick);
    };

    const prev = active > 0 ? sections[active - 1] : null;
    const next = active >= 0 && active < sections.length - 1 ? sections[active + 1] : null;
    const activeId = active >= 0 ? sections[active].id : null;

    const stickySection = stickyIdx >= 0 ? sections[stickyIdx] : null;
    // the section's parent part, or the page's main title for top-level parts
    const stickyParent = stickySection ? sectionParents?.[stickySection.id] ?? mainTitle : undefined;

    // Only surfaces once the reader is inside an article.
    if (active < 0) return null;

    return (
        <>
            {stickySection && (
                <div className="fixed inset-x-0 top-0 z-30 bg-background/95 backdrop-blur lg:hidden">
                    <div className="mx-auto max-w-6xl px-4 py-2.5">
                        {stickyParent && (
                            <div className="text-xs font-medium text-muted-foreground">{stickyParent}</div>
                        )}
                        <div className="!text-left text-xl font-normal !leading-none text-foreground sm:text-2xl">
                            {stickySection.title}
                        </div>
                    </div>
                </div>
            )}

            <nav
                aria-label="Πλοήγηση άρθρων"
                className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur lg:hidden"
            >
                <div className="mx-auto flex max-w-6xl items-center gap-1 px-2 py-1.5">
                    {prev ? (
                        <button
                            type="button"
                            onClick={() => go(prev.id)}
                            className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1.5 text-left"
                        >
                            <ArrowLeft className="h-5 w-5 shrink-0 text-orange" aria-hidden="true" />
                            <span className="min-w-0">
                                <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
                                    Προηγούμενο
                                </span>
                                <span className="line-clamp-2 text-[13px] font-semibold leading-tight [overflow-wrap:anywhere]">
                                    {prev.title}
                                </span>
                            </span>
                        </button>
                    ) : (
                        <span className="flex-1" />
                    )}
                    <button
                        type="button"
                        onClick={() => setTocOpen(true)}
                        aria-label="Περιεχόμενα"
                        aria-haspopup="dialog"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange text-white transition-colors hover:bg-orange/90"
                    >
                        <List className="h-5 w-5" aria-hidden="true" />
                    </button>
                    {next ? (
                        <button
                            type="button"
                            onClick={() => go(next.id)}
                            className="flex min-w-0 flex-1 flex-row-reverse items-center gap-2 px-1.5 py-1.5 text-right"
                        >
                            <ArrowRight className="h-5 w-5 shrink-0 text-orange" aria-hidden="true" />
                            <span className="min-w-0">
                                <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
                                    Επόμενο
                                </span>
                                <span className="line-clamp-2 text-[13px] font-semibold leading-tight [overflow-wrap:anywhere]">
                                    {next.title}
                                </span>
                            </span>
                        </button>
                    ) : (
                        <span className="flex-1" />
                    )}
                </div>
            </nav>

            {/* vaul skips putting the page scroll back when the URL changed while the
                drawer was open, and the scroll-spy changes the hash. Always put it back. */}
            <Drawer open={tocOpen} onOpenChange={setTocOpen} preventScrollRestoration={false}>
                <DrawerContent
                    className="flex max-h-[85vh] flex-col"
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    // Focus going back to the bar's button would cut the scroll to the tapped entry short.
                    onCloseAutoFocus={(event) => event.preventDefault()}
                >
                    <div className="flex items-center justify-between px-4 pb-2 pt-2">
                        <DrawerTitle className="!m-0 !text-left !text-xs !font-bold !leading-none uppercase tracking-wider !text-muted-foreground">
                            Περιεχόμενα
                        </DrawerTitle>
                        <button
                            type="button"
                            onClick={() => goFromToc(TOP)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground"
                        >
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                            Αρχή σελίδας
                        </button>
                    </div>
                    <DrawerDescription className="sr-only">Όλες οι ενότητες της σελίδας. Πατήστε μία για να πάτε εκεί.</DrawerDescription>
                    <div ref={tocListRef} className="overflow-y-auto overscroll-contain px-4 pb-8">
                        <TocTree groups={groups} activeId={activeId} onSelect={goFromToc} />
                    </div>
                </DrawerContent>
            </Drawer>
        </>
    );
}
