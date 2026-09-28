import { cn } from "@/lib/utils";

/**
 * A hairline on each side of a word, between two ways of doing the same
 * thing. Decorative: the choices around it say what they are.
 */
export function OrDivider({ label, className }: { label: string; className?: string }) {
    return (
        <div className={cn("flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground", className)} aria-hidden>
            <span className="h-px flex-1 bg-border" />
            {label}
            <span className="h-px flex-1 bg-border" />
        </div>
    );
}
