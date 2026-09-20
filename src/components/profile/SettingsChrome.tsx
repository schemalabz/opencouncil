import { AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { surfaceCardClass } from "@/components/ui/surface-card";

/**
 * The chrome the profile's settings tabs share: a section heading, the card
 * a group of settings sits in, and the row one setting takes inside it. One
 * type scale and one card, so the four tabs read as one page.
 */

/** A tab's title and its one-line lead, above the cards. */
export function SectionHeading({ title, lead }: { title: string; lead: string }) {
    return (
        <div className="mb-4 lg:mb-5">
            {/* The global h2 rule centres and lightens every h2; this one is a settings title. */}
            <h2 className="!text-left !text-[20px] !font-semibold leading-tight tracking-[-0.01em] lg:!text-[22px]">{title}</h2>
            <p className="mt-1 text-[14px] leading-[1.45] text-muted-foreground">{lead}</p>
        </div>
    );
}

/**
 * A group of settings. With a `title` the card gets a header of its own,
 * for a tab that holds more than one card. `tone="danger"` is the delete
 * card: red hairline, the same shape.
 */
export function SettingsCard({
    title,
    description,
    action,
    tone = "default",
    className,
    children,
}: {
    title?: React.ReactNode;
    description?: React.ReactNode;
    /** A control at the end of the header row: a button, a switch. */
    action?: React.ReactNode;
    tone?: "default" | "danger";
    className?: string;
    children?: React.ReactNode;
}) {
    return (
        <section
            className={cn(
                surfaceCardClass,
                "overflow-hidden",
                tone === "danger" && "border-red-200 bg-red-50/40",
                className,
            )}
        >
            {(title || description || action) && (
                <div className={cn("flex items-start justify-between gap-4 px-4 pt-4 sm:px-5 sm:pt-5", !children && "pb-4 sm:pb-5")}>
                    <div className="min-w-0">
                        {title && (
                            <h3 className={cn("text-[15px] font-semibold leading-snug", tone === "danger" && "text-red-700")}>
                                {title}
                            </h3>
                        )}
                        {description && (
                            <p className="mt-1 text-[13px] leading-[1.45] text-muted-foreground">{description}</p>
                        )}
                    </div>
                    {action && <div className="shrink-0">{action}</div>}
                </div>
            )}
            {children}
        </section>
    );
}

/** The padded body of a card: a form, a list, a paragraph. */
export function SettingsBody({ className, children }: { className?: string; children: React.ReactNode }) {
    return <div className={cn("px-4 py-4 sm:px-5 sm:py-5", className)}>{children}</div>;
}

/**
 * One setting in a card: a label, a line under it, and its control at the
 * end. Rows stack with a hairline between them.
 */
export function SettingsRow({
    label,
    description,
    control,
    htmlFor,
    className,
}: {
    label: React.ReactNode;
    description?: React.ReactNode;
    control: React.ReactNode;
    /** The id of the control, so the label reaches it. */
    htmlFor?: string;
    className?: string;
}) {
    return (
        <div className={cn("flex items-start justify-between gap-4 px-4 py-4 sm:px-5", className)}>
            <div className="min-w-0 flex-1">
                <label htmlFor={htmlFor} className={cn("block text-[15px] font-medium leading-snug", htmlFor && "cursor-pointer")}>
                    {label}
                </label>
                {description && <p className="mt-1 text-[13px] leading-[1.45] text-muted-foreground">{description}</p>}
            </div>
            <div className="shrink-0 pt-0.5">{control}</div>
        </div>
    );
}

/** Rows in a card, one hairline between each pair. */
export function SettingsRows({ children }: { children: React.ReactNode }) {
    return <div className="divide-y divide-border">{children}</div>;
}

/**
 * What a save said, in one line under the form: a tick that fades once the
 * save is a few seconds old, or the reason it failed.
 */
export function SaveStatus({ state, savedLabel, errorLabel }: {
    state: "idle" | "saved" | "error";
    savedLabel: string;
    errorLabel: string;
}) {
    if (state === "idle") return null;
    if (state === "saved") {
        return (
            <span role="status" className="inline-flex items-center gap-1.5 text-[13px] text-emerald-700 animate-in fade-in duration-300">
                <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                {savedLabel}
            </span>
        );
    }
    return (
        <span role="alert" className="inline-flex items-start gap-1.5 text-[13px] text-red-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {errorLabel}
        </span>
    );
}

/** A field's error under it, in the form's own red. */
export function FieldError({ children }: { children: React.ReactNode }) {
    return (
        <p role="alert" className="flex items-start gap-1.5 text-[13px] leading-snug text-red-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {children}
        </p>
    );
}
