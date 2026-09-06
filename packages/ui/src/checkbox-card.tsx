"use client"

import { ReactNode, useId } from "react"
import { Checkbox } from "./checkbox"
import { cn } from "./lib/utils"

interface CheckboxCardProps {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    /** The option, in a few words. Phrasing content: it sits inside the label. */
    label: ReactNode
    /** Help text under the label. Phrasing content, like the label. */
    description?: ReactNode
    /** A short uppercase tag at the end of the header, for example "recommended". */
    badge?: string
    /** An icon at the end of the header. */
    icon?: ReactNode
    disabled?: boolean
    /**
     * Content under the header while the card is on — a field the choice
     * reveals. It stays outside the label, so typing in it never flips the card.
     */
    children?: ReactNode
    className?: string
}

/**
 * A card that is a checkbox. The whole header is the checkbox's label, so
 * tapping anywhere on it toggles; the body shows only while the card is on.
 * The box itself is the app's checkbox, so a tick looks the same here as
 * everywhere else. A ticked card stays white and lifts: an orange halo and a
 * warm shadow, so the choice reads without the whole card turning orange.
 */
export function CheckboxCard({
    checked,
    onCheckedChange,
    label,
    description,
    badge,
    icon,
    disabled = false,
    children,
    className,
}: CheckboxCardProps) {
    const id = useId()
    const descriptionId = `${id}-description`

    return (
        // A checkbox reads left of its own label, so the card sets its alignment
        // rather than inherit it. DialogContent centers its content by default.
        <div
            className={cn(
                "rounded-2xl border bg-card text-left transition-[border-color,box-shadow] duration-300 ease-out",
                checked
                    ? "border-[hsl(var(--orange))]/60 shadow-[0_0_0_2px_hsl(var(--orange)/0.08),0_6px_18px_-12px_hsl(var(--orange)/0.35)]"
                    : "border-foreground/15 shadow-none",
                className
            )}
        >
            <label
                htmlFor={id}
                className={cn(
                    "flex min-h-[56px] w-full items-center gap-3 px-3.5 py-3",
                    disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
                )}
            >
                <Checkbox
                    id={id}
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(value) => onCheckedChange(value === true)}
                    // A disabled card explains itself in the description, so the
                    // reason must reach a screen reader with the checkbox
                    aria-describedby={description ? descriptionId : undefined}
                    className="h-[22px] w-[22px] shrink-0 rounded-[6px] border-foreground/60 [&_svg]:h-4 [&_svg]:w-4"
                />
                <span className="min-w-0 flex-1">
                    <span className="block text-base leading-tight">{label}</span>
                    {description && (
                        <span id={descriptionId} className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">
                            {description}
                        </span>
                    )}
                </span>
                {badge && (
                    <span className="shrink-0 rounded-full bg-[hsl(var(--orange))]/10 px-2 py-1 text-[11px] font-extrabold uppercase tracking-[.1em] text-[hsl(var(--orange-deep))]">
                        {badge}
                    </span>
                )}
                {icon}
            </label>
            {checked && children ? <div className="px-3.5 pb-3.5">{children}</div> : null}
        </div>
    )
}
