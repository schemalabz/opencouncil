"use client";

import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { surfaceCardClass } from "@/components/ui/surface-card";
import { formatDate, formatRelativeTime } from "@/lib/formatters/time";

/**
 * The fields this card draws, from either source the page has: the record Prisma
 * rendered (Dates) or the one the Diavgeia poll just returned over the wire
 * (ISO strings). `new Date()` takes both.
 */
export interface SubjectDecision {
    ada: string | null;
    decisionNumber: string | null;
    protocolNumber: string | null;
    title: string | null;
    pdfUrl: string;
    publishDate: string | Date | null;
    updatedAt: string | Date | null;
}

interface DecisionCardProps {
    decision: SubjectDecision;
    locale: string;
    /** Opens the document sheet. */
    onView: () => void;
    /**
     * Shut until the reader opens it, and never shut from `lg`. The phone
     * carries the card near the top of the page, where a full record would push
     * the discussion itself off the screen; the rail has the room.
     */
    collapsible?: boolean;
    className?: string;
    id?: string;
}

/**
 * The Diavgeia record for a subject, on the phone and in the rail.
 *
 * One component for both, because they had drifted into two: a phone strip that
 * showed the ΑΔΑ and a link, and a rail card that showed everything. A reader on
 * a phone could not see the protocol number or the publication date at all.
 *
 * The ΑΔΑ is the card's identity, so it is what the shut card shows — as a code,
 * not as a link. The action to open the document belongs to the body, where a
 * reader has seen what they are opening.
 */
export function DecisionCard({ decision, locale, onView, collapsible = false, className, id }: DecisionCardProps) {
    const t = useTranslations("Subject");
    const [open, setOpen] = useState(false);

    const facts: Array<{ label: string; value: string }> = [
        ...(decision.decisionNumber ? [{ label: t("decisionNumber"), value: decision.decisionNumber }] : []),
        ...(decision.protocolNumber ? [{ label: t("protocolNumber"), value: decision.protocolNumber }] : []),
        ...(decision.publishDate
            ? [{ label: t("publishDate"), value: formatDate(new Date(decision.publishDate), undefined, locale) }]
            : []),
    ];

    const head = (
        <>
            <span className="text-[11px] font-extrabold tracking-[.04em] text-muted-foreground">{t("decision")}</span>
            {decision.ada && (
                // Not a monospace face. An ΑΔΑ mixes Greek capitals, Latin and
                // digits, and Roboto Mono carries no Greek — the Greek fell back to
                // another font mid-code, so half the characters rendered a size
                // bigger than the rest. One face, letter-spaced, on a chip whose
                // 6px corner is the card's own 16px less its padding.
                <span className="inline-flex min-w-0 items-baseline gap-1.5 rounded-[6px] border border-border bg-muted/60 px-2 py-[3px]">
                    <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-[.08em] text-muted-foreground">
                        {t("adaLabel")}
                    </span>
                    <span className="min-w-0 break-all text-[11.5px] font-semibold tracking-[.02em] tabular-nums text-foreground/85">
                        {decision.ada}
                    </span>
                </span>
            )}
        </>
    );

    return (
        <div id={id} className={cn(surfaceCardClass, "overflow-hidden", className)}>
            {collapsible && (
                <button
                    type="button"
                    onClick={() => setOpen(value => !value)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-foreground/[0.03] lg:hidden"
                >
                    <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">{head}</span>
                    <ChevronDown
                        className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                        aria-hidden
                    />
                </button>
            )}

            <div className={cn(collapsible && (open ? "block" : "hidden"), collapsible && "lg:block")}>
                <div className="space-y-3 px-4 py-3.5">
                    {/* The head repeats inside only where the shut row is absent —
                        the rail, and every width from `lg`. */}
                    <div className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-0.5", collapsible && "hidden lg:flex")}>
                        {head}
                    </div>

                    {decision.title && (
                        <p className="text-[12.5px] leading-relaxed text-foreground/85">{decision.title}</p>
                    )}

                    {facts.length > 0 && (
                        // Label above value, not beside it: in a 316px rail the two
                        // columns left "94/11-2-26" hanging a long way from the label
                        // that named it, and on a phone the pair simply wrapped.
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border pt-3">
                            {facts.map(fact => (
                                <div key={fact.label} className="min-w-0">
                                    <dt className="text-[10.5px] font-semibold uppercase tracking-[.04em] text-muted-foreground">
                                        {fact.label}
                                    </dt>
                                    <dd className="mt-0.5 break-words text-[12.5px] tabular-nums">{fact.value}</dd>
                                </div>
                            ))}
                        </dl>
                    )}

                    <div className="space-y-1.5 border-t border-border pt-3">
                        <button
                            type="button"
                            onClick={onView}
                            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-[8px] bg-[hsl(var(--orange-deep))] px-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                        >
                            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {t("viewDecision")}
                        </button>
                        {decision.updatedAt && (
                            // Clock-relative text — see formatRelativeTime.
                            <p className="text-center text-[10.5px] text-muted-foreground" suppressHydrationWarning>
                                {t("lastUpdated", { time: formatRelativeTime(new Date(decision.updatedAt), locale) })}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
