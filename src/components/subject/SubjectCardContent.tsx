import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Icon from "@/components/icon";
import { MapPin, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SubjectCardContentProps {
    /** Subject title. */
    title: string;
    topic?: { colorHex?: string | null; icon?: string | null } | null;
    /** Cross-meeting context (shown when the card isn't already inside a meeting). */
    context?: { meta: string; meetingName: string } | null;
    /** Location text; omit the row entirely when null/undefined. */
    locationText?: string | null;
    /** Agenda marker (e.g. "#3" or "Προ ημερησίας"); omit when null. */
    agendaLabel?: string | null;
    /** Description, already markdown-stripped. */
    description?: string | null;
    /** Optional media above the description (app: highlight video). */
    mediaSlot?: React.ReactNode;
    /** Optional footer (app: speaking stats + avatars; widget: none or a light row). */
    footer?: React.ReactNode;
    /** Optional overlay inside the card (app: loading spinner). */
    overlay?: React.ReactNode;
    /** Disables the Card's animated hover border. */
    disableHover?: boolean;
    /** Dims the card (withdrawn subjects). */
    dimmed?: boolean;
    /** Tighter padding / smaller type for dense contexts like the embed widget. */
    compact?: boolean;
}

/**
 * Presentational core of a subject card — no hooks, no data fetching, no router.
 * Shared by the app's interactive SubjectCard and the embed widget, so both look
 * the same. Because it's a plain Server Component, the widget can render it with
 * a tiny client footprint (no heavy tree in the iframe bundle).
 */
export function SubjectCardContent({
    title,
    topic,
    context,
    locationText,
    agendaLabel,
    description,
    mediaSlot,
    footer,
    overlay,
    disableHover,
    dimmed,
    compact,
}: SubjectCardContentProps) {
    return (
        <Card
            disableHover={disableHover}
            className={cn(
                "relative group/card hover:shadow-md transition-all duration-300 w-full h-full",
                disableHover && "hover:shadow-none",
                dimmed && "opacity-60",
            )}
        >
            {overlay}
            <div className="flex flex-col h-full">
                {/* Header: topic icon + title + meta */}
                <CardHeader className={cn("flex flex-col gap-1.5 pb-2", compact && "p-3 pb-1.5")}>
                    <div className="flex flex-row items-center gap-1.5">
                        <div
                            className="p-1.5 rounded-full shrink-0 transition-colors duration-300"
                            style={{ backgroundColor: topic?.colorHex ? topic.colorHex + "20" : "#e5e7eb" }}
                        >
                            <Icon name={topic?.icon || "hash"} color={topic?.colorHex || "#9ca3af"} size={compact ? 14 : 16} />
                        </div>
                        <CardTitle className={cn("text-sm sm:text-base line-clamp-2 flex-1 group-hover/card:text-accent-foreground transition-colors duration-300", compact && "sm:text-sm")}>
                            {title}
                        </CardTitle>
                    </div>
                    {context && (
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-muted-foreground/70">{context.meta}</span>
                            <span className="text-xs font-medium text-foreground/90">{context.meetingName}</span>
                        </div>
                    )}
                    {(locationText != null || agendaLabel != null) && (
                        <div className="flex flex-row justify-between gap-2 text-xs text-muted-foreground">
                            {locationText != null && (
                                <div className="flex items-center gap-1 min-w-0 flex-1">
                                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">{locationText}</span>
                                </div>
                            )}
                            {agendaLabel != null && (
                                <div className="flex items-center gap-1 shrink-0">
                                    <ScrollText className="w-3.5 h-3.5 shrink-0" />
                                    <div className="text-xs text-muted-foreground">{agendaLabel}</div>
                                </div>
                            )}
                        </div>
                    )}
                </CardHeader>

                {/* Content: media + description */}
                {(mediaSlot || description) && (
                    <CardContent className={cn("flex-1 pb-2 max-w-full overflow-hidden", compact && "px-3 pb-1.5")}>
                        {mediaSlot}
                        {description && (
                            <div className={cn("text-xs sm:text-sm text-muted-foreground line-clamp-4 sm:line-clamp-5 group-hover/card:text-muted-foreground/80 transition-colors duration-300", compact && "sm:text-xs line-clamp-3 sm:line-clamp-3")}>
                                {description}
                            </div>
                        )}
                    </CardContent>
                )}

                {/* Footer slot */}
                {footer && (
                    <CardFooter className={cn("pt-0 mt-auto flex flex-col gap-2", compact && "px-3 pb-3")}>{footer}</CardFooter>
                )}
            </div>
        </Card>
    );
}
