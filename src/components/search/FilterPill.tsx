"use client";

import { ReactNode, useState } from "react";
import { ChevronDown, X, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface FilterPillProps {
    /** Field name, shown when nothing is selected and as the prefix when something is. */
    label: string;
    /** Human-readable current selection. Present means the filter is active. */
    value?: string | null;
    /** Shown after the value and never truncated (e.g. "+2" for extra selections). */
    valueSuffix?: string | null;
    icon: LucideIcon;
    disabled?: boolean;
    /**
     * The inline clear button: the handler and its accessible name travel
     * together, so a pill cannot require a label for a button it never renders.
     * Omit to hide the button (a filter that can only be changed, not removed).
     */
    clear?: { label: string; onClear: () => void };
    /** Receives a callback that closes the panel, for single-select controls. */
    children: (close: () => void) => ReactNode;
    contentClassName?: string;
    /**
     * Base width (e.g. "w-44"), so filling the pill with a value doesn't resize
     * it and shove the rest of the row around — the label/value truncates
     * within the width instead. The pill also grows past it, so the row
     * stretches to the full width of the search bar above.
     */
    widthClassName?: string;
}

/**
 * One filter in the desktop search filter bar: a pill that opens its control in a popover.
 *
 * The pill is a container, not a button — the trigger and the clear button are
 * siblings inside it, because a button cannot be nested in another button.
 */
export default function FilterPill({
    label,
    value,
    valueSuffix,
    icon: Icon,
    disabled = false,
    clear,
    children,
    contentClassName,
    widthClassName,
}: FilterPillProps) {
    const [open, setOpen] = useState(false);
    const isActive = !!value;
    const close = () => setOpen(false);

    const trigger = (
        <button
            type="button"
            disabled={disabled}
            // The icon alone identifies an active filter's field, so the value
            // gets the full pill width; the title restores the field name on hover.
            title={isActive ? `${label}: ${value}${valueSuffix ? ` ${valueSuffix}` : ""}` : undefined}
            className={cn(
                "flex min-w-0 flex-1 items-center gap-1.5 h-9 pl-3 text-sm transition-colors",
                isActive && clear ? "pr-1.5" : "pr-3",
                disabled && "cursor-not-allowed"
            )}
        >
            <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-left">
                {isActive ? <span className="font-medium">{value}</span> : label}
            </span>
            {isActive && valueSuffix && <span className="shrink-0 font-medium">{valueSuffix}</span>}
            {!isActive && <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />}
        </button>
    );

    const pill = (
        <div
            className={cn(
                "inline-flex shrink-0 grow items-center rounded-full border shadow-sm transition-colors",
                isActive
                    ? "border-[hsl(var(--orange))]/40 bg-[hsl(var(--orange))]/5 text-foreground"
                    : "border-input bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                disabled && "opacity-50",
                widthClassName
            )}
        >
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            {isActive && clear && (
                <button
                    type="button"
                    onClick={clear.onClear}
                    // Names the action, not the value: a label of "City: Athens ✕"
                    // tells a screen-reader user what the filter holds but not
                    // what the button does, and reads the glyph aloud as
                    // "multiplication x".
                    aria-label={clear.label}
                    className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
            )}
        </div>
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            {pill}
            <PopoverContent
                align="start"
                collisionPadding={16}
                className={cn("w-72 max-h-[70vh] overflow-y-auto p-0", contentClassName)}
            >
                {children(close)}
            </PopoverContent>
        </Popover>
    );
}
