"use client";

import { useRef } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";

export interface SubstackPost {
    title: string;
    description: string;
    url: string;
    /** Cover image (Substack og:image). */
    image?: string;
}

/**
 * Reusable, on-brand carousel of Substack posts. Renders custom preview cards
 * (title + description + link) in a horizontally scrollable, snapping row with
 * prev/next controls — instead of Substack's own embed iframe, so it matches the
 * app's design. Pass the posts as data.
 */
export function SubstackCarousel({
    posts,
    heading = "Διάβασε περισσότερα",
    id,
}: {
    posts: SubstackPost[];
    heading?: string;
    id?: string;
}) {
    const scroller = useRef<HTMLDivElement>(null);

    const scrollByCards = (dir: 1 | -1) => {
        const el = scroller.current;
        if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
    };

    return (
        <section id={id} className="not-prose my-8 scroll-mt-24">
            <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-2xl sm:text-3xl text-foreground">{heading}</h3>
                <div className="flex gap-1.5">
                    <button
                        type="button"
                        onClick={() => scrollByCards(-1)}
                        aria-label="Προηγούμενα"
                        className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:border-orange hover:text-orange"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => scrollByCards(1)}
                        aria-label="Επόμενα"
                        className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:border-orange hover:text-orange"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            </div>

            <div
                ref={scroller}
                className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                {posts.map((p) => (
                    <a
                        key={p.url}
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="unstyled group flex w-[280px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-orange sm:w-[320px]"
                    >
                        {p.image && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={p.image}
                                alt={p.title}
                                loading="lazy"
                                className="aspect-[16/9] w-full object-cover"
                            />
                        )}
                        <div className="flex flex-1 flex-col p-5">
                            <h4 className="line-clamp-3 font-semibold leading-snug text-foreground">{p.title}</h4>
                            <p className="mt-2 line-clamp-4 flex-1 text-sm leading-relaxed text-muted-foreground">
                                {p.description}
                            </p>
                            <span className="mt-4 inline-flex items-center gap-1 self-end text-sm font-medium text-orange">
                                Διάβασε στο Substack
                                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                            </span>
                        </div>
                    </a>
                ))}
            </div>
        </section>
    );
}
