"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/routing";
import { ZoomLightbox } from "./ZoomLightbox";

export interface AgendaPage {
    src: string;
    alt: string;
}

export interface AgendaMeeting {
    href: string;
    city: string;
    title: string;
    date: string;
    /** Municipality logo URL. */
    logo?: string;
    cta?: string;
}

/**
 * A framed document viewer (e.g. a council agenda). Renders an inline PDF, a
 * small-screen first-page image, or a scrollable mat of page images — the image
 * variants open in a gesture-driven {@link ZoomLightbox} (pinch/wheel to zoom,
 * drag to pan). Optionally shows embedded meeting info with a link to it.
 */
export function AgendaViewer({
    title,
    badge,
    pages,
    pdf,
    mobileImage,
    meeting,
}: {
    title: string;
    badge?: string;
    /** Page images, shown in a scrollable mat with a click-to-zoom lightbox. */
    pages?: AgendaPage[];
    /** Or a PDF URL, rendered inline via the browser's native viewer. */
    pdf?: string;
    /** First-page screenshot shown instead of the PDF on small screens, where
        the nested PDF scroll makes the page hard to scroll past. */
    mobileImage?: string;
    /** Optional meeting info, shown embedded above the document with a link to it. */
    meeting?: AgendaMeeting;
}) {
    const [openPage, setOpenPage] = useState<AgendaPage | null>(null);

    return (
        <div className="not-prose mx-auto my-8 max-w-[840px]">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
                <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/30" />
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/30" />
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/30" />
                    <span className="ml-1 min-w-0 truncate text-[13px] text-muted-foreground">{title}</span>
                    {badge && (
                        <span className="ml-auto shrink-0 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                            {badge}
                        </span>
                    )}
                </div>

                {meeting && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3">
                        {meeting.logo && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={meeting.logo}
                                alt={meeting.city}
                                loading="lazy"
                                className="h-14 w-14 shrink-0 object-contain"
                            />
                        )}
                        <div className="min-w-0">
                            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {meeting.city}
                            </div>
                            <div className="font-semibold leading-tight text-foreground">{meeting.title}</div>
                            <div className="mt-0.5 text-sm text-muted-foreground">{meeting.date}</div>
                        </div>
                        <Link
                            href={meeting.href}
                            className="unstyled group ml-auto inline-flex shrink-0 items-center gap-1 text-sm font-medium text-orange hover:text-orange/80"
                        >
                            {meeting.cta ?? "Δες τη συνεδρίαση"}
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                    </div>
                )}

                {pdf ? (
                    <>
                        {mobileImage && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={mobileImage}
                                alt={title}
                                loading="lazy"
                                onClick={() => setOpenPage({ src: mobileImage, alt: title })}
                                className="block w-full cursor-zoom-in bg-muted/40 sm:hidden"
                            />
                        )}
                        <iframe
                            src={`${pdf}#view=FitH`}
                            title={title}
                            className={`h-[600px] w-full border-0 bg-muted/40 ${
                                mobileImage ? "hidden sm:block" : "block"
                            }`}
                        />
                    </>
                ) : (
                    <div className="flex max-h-[560px] flex-col gap-[18px] overflow-y-auto bg-muted/40 p-[22px]">
                        {(pages ?? []).map((p) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                key={p.src}
                                src={p.src}
                                alt={p.alt}
                                loading="lazy"
                                onClick={() => setOpenPage(p)}
                                className="block w-full cursor-zoom-in rounded-md border border-border bg-white shadow-sm"
                            />
                        ))}
                    </div>
                )}
            </div>

            {pdf && (
                <div className="mt-2 text-center text-xs text-muted-foreground">
                    <a href={pdf} target="_blank" rel="noopener noreferrer" className="underline hover:text-orange">
                        Άνοιγμα PDF σε νέα καρτέλα
                    </a>
                </div>
            )}

            {openPage && <ZoomLightbox src={openPage.src} alt={openPage.alt} onClose={() => setOpenPage(null)} />}
        </div>
    );
}
