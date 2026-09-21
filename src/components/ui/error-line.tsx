import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = {
    /** Under a field, or in a footer: the profile forms, the signup's action bar. */
    sm: { line: "gap-1.5 text-[13px]", icon: "h-3.5 w-3.5" },
    /** At the reading size of a step: the join flow. */
    md: { line: "gap-2 text-[15px]", icon: "h-4 w-4" },
} as const;

/**
 * One line that says what went wrong: the alert glyph and the words, in the
 * app's red. The glyph hangs at the top, so a message that wraps starts
 * beside it. It is an alert, so a screen reader hears it as it appears; a
 * caller that also names it from a control passes an `id` for
 * `aria-describedby`.
 */
export function ErrorLine({
    size = "sm",
    className,
    children,
    ...props
}: React.HTMLAttributes<HTMLParagraphElement> & { size?: keyof typeof SIZES }) {
    return (
        <p role="alert" className={cn("flex items-start leading-snug text-red-700", SIZES[size].line, className)} {...props}>
            <AlertCircle className={cn("mt-0.5 shrink-0", SIZES[size].icon)} aria-hidden />
            {children}
        </p>
    );
}
