"use client";

import { cn } from "@/lib/utils";
import { ViewLink } from "./views/ui";

export interface ConsultationBarProps {
    title: string;
    municipalityName?: string;
    deadlineLabel: string;
    homeHref: string;
    planHref?: string;
    commentsHref: string;
    commentCount: number;
    studyHref: string;
    className?: string;
}

const linkClass = "text-[15px] font-semibold text-[#9a3412] underline-offset-2 hover:underline";

/** The computer's consultation bar, under the site's header: what this is, until when, and the three ways to read it. */
export default function ConsultationBar({
    title,
    municipalityName,
    deadlineLabel,
    homeHref,
    planHref,
    commentsHref,
    commentCount,
    studyHref,
    className,
}: ConsultationBarProps) {
    return (
        <header className={cn("h-14 shrink-0 items-center gap-4 border-b border-stone-200 bg-white px-4 text-stone-900", className)}>
            <div className="flex min-w-0 flex-col">
                <ViewLink href={homeHref} className="truncate text-base font-bold leading-tight hover:underline">{title}</ViewLink>
                <span className="truncate text-[13px] leading-tight text-stone-600">
                    {municipalityName ? `${municipalityName} · ` : ''}{deadlineLabel}
                </span>
            </div>
            <nav aria-label="Η διαβούλευση" className="ml-auto flex shrink-0 items-center gap-5">
                {planHref && <ViewLink href={planHref} className={linkClass}>Το σχέδιο σε 2 λεπτά</ViewLink>}
                <ViewLink href={commentsHref} className={linkClass}>
                    Τι λένε οι δημότες{commentCount > 0 ? ` (${commentCount})` : ''}
                </ViewLink>
                <ViewLink href={studyHref} className={linkClass}>Η μελέτη</ViewLink>
            </nav>
        </header>
    );
}
