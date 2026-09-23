import { Clock, MessageSquare } from "lucide-react";
import type { SubjectCardStats } from "@/lib/subjectCardStats";
import { cn } from "@/lib/utils";

interface SubjectStatsRowProps {
    stats: SubjectCardStats;
    /** Localized speaking-time text, already pluralized (e.g. "12 minutes"). */
    minutesText: string;
    className?: string;
    /** Push the party dots to the far end of the row. */
    dotsAtEnd?: boolean;
}

/**
 * A subject's stats in one row: speaking minutes, speaker count, party dots.
 * The card footer, the list row and the related section all draw it, so
 * they render identically. Renders nothing when there is nothing to say.
 */
export function SubjectStatsRow({ stats, minutesText, className, dotsAtEnd }: SubjectStatsRowProps) {
    if (stats.minutes === 0 && stats.speakerCount === 0 && stats.partyDots.length === 0) return null;
    return (
        <div className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
            {stats.minutes > 0 && (
                <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{minutesText}</span>
                </span>
            )}
            {stats.speakerCount > 0 && (
                <span className="flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>{stats.speakerCount}</span>
                </span>
            )}
            {stats.partyDots.length > 0 && (
                <span className={cn("flex shrink-0 items-center gap-1", dotsAtEnd && "ml-auto")}>
                    {stats.partyDots.map(p => (
                        <span key={p.id} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.colorHex }} title={p.name} />
                    ))}
                </span>
            )}
        </div>
    );
}
