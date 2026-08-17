"use client"

import { ReactNode, useId } from "react"
import { Checkbox } from "./checkbox"
import { Label } from "./label"
import { cn } from "./lib/utils"

interface CheckboxCardProps {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    label: ReactNode
    /** Help text under the label. */
    description?: ReactNode
    disabled?: boolean
    /** Content under the checkbox row, for example an input that the checkbox reveals. */
    children?: ReactNode
    className?: string
}

/**
 * A checkbox with a label and help text, inside a bordered card.
 * Use it for an option that the user confirms before a destructive or outward-facing action.
 */
export function CheckboxCard({
    checked,
    onCheckedChange,
    label,
    description,
    disabled = false,
    children,
    className,
}: CheckboxCardProps) {
    const id = useId()
    const descriptionId = `${id}-description`

    return (
        // A checkbox reads left of its own label, so the card sets its alignment
        // rather than inherit it. DialogContent centers its content by default.
        <div className={cn("w-full p-4 border rounded-lg space-y-3 text-left", className)}>
            <div className="flex items-start gap-2">
                <Checkbox
                    id={id}
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(value) => onCheckedChange(value === true)}
                    // A disabled card explains itself in the description, so the
                    // reason must reach a screen reader with the checkbox
                    aria-describedby={description ? descriptionId : undefined}
                    className="mt-0.5"
                />
                <div className="grid gap-1.5 leading-none min-w-0">
                    <Label
                        htmlFor={id}
                        className={cn(
                            "text-sm font-medium leading-none",
                            disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"
                        )}
                    >
                        {label}
                    </Label>
                    {description && (
                        <div id={descriptionId} className="text-sm text-muted-foreground space-y-1">
                            {description}
                        </div>
                    )}
                </div>
            </div>
            {children}
        </div>
    )
}
