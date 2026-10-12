"use client";

import { cn } from "@/lib/utils";
import { primaryButtonClass, ViewLink } from "./views/ui";

export interface ConsultationBarProps {
    municipalityName?: string;
    deadlineLabel: string;
    /** Whether comments are still open; an ended consultation's date is not coloured. */
    deadlineActive: boolean;
    homeHref: string;
    planHref?: string;
    commentsHref: string;
    commentCount: number;
    studyHref: string;
    /** Where "Σχολιάστε" leads while the consultation is open. */
    commentHref?: string;
    className?: string;
}

const linkClass = "text-[15px] font-semibold text-[#9a3412] underline-offset-2 hover:underline";

/**
 * The computer's consultation bar, under the site's header: who asks, until when, and the three
 * ways to read it. The site's header above it carries the consultation's title.
 */
export default function ConsultationBar({
    municipalityName,
    deadlineLabel,
    deadlineActive,
    homeHref,
    planHref,
    commentsHref,
    commentCount,
    studyHref,
    commentHref,
    className,
}: ConsultationBarProps) {
    return (
        <header className={cn("h-14 shrink-0 items-center gap-4 border-b border-stone-200 bg-white px-4 text-stone-900", className)}>
            <ViewLink href={homeHref} className="truncate text-[15px] text-stone-600 hover:underline">
                {municipalityName ? `${municipalityName} · ` : ''}<span className={cn(deadlineActive && "font-semibold text-[#7c2d12]")}>{deadlineLabel}</span>
            </ViewLink>
            <nav aria-label="Η διαβούλευση" className="ml-auto flex shrink-0 items-center gap-5">
                {planHref && <ViewLink href={planHref} className={linkClass}>Το σχέδιο σε 2 λεπτά</ViewLink>}
                <ViewLink href={commentsHref} className={linkClass}>
                    Τι λένε οι δημότες{commentCount > 0 ? ` (${commentCount})` : ''}
                </ViewLink>
                <ViewLink href={studyHref} className={linkClass}>Η μελέτη</ViewLink>
                {commentHref && (
                    <ViewLink href={commentHref} className={cn(primaryButtonClass, "min-h-0 w-auto px-4 py-2 text-[15px] hover:no-underline")}>
                        Σχολιάστε
                    </ViewLink>
                )}
            </nav>
        </header>
    );
}
