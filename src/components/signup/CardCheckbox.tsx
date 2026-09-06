'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A card that is a checkbox. The whole header toggles it; the body — a
 * phone field, say — shows only while it is on, and stays outside the
 * toggle so typing in it never flips the card. The delivery channels and
 * the petition's relation to the municipality are both made of these.
 */
export function CardCheckbox({
    checked,
    onToggle,
    title,
    description,
    badge,
    icon,
    emphasized = false,
    children,
}: {
    checked: boolean;
    onToggle: () => void;
    title: string;
    description?: string;
    badge?: string;
    icon?: React.ReactNode;
    /** The recommended choice: an orange ring while it is on. */
    emphasized?: boolean;
    children?: React.ReactNode;
}) {
    return (
        <div
            className={cn(
                'rounded-2xl border bg-card transition-colors',
                checked && emphasized ? 'border-2 border-[hsl(var(--orange))]' : 'border-foreground/15',
            )}
        >
            <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={onToggle}
                className="flex min-h-[56px] w-full items-center gap-3 px-3.5 py-3 text-left"
            >
                <span
                    className={cn(
                        'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded border border-foreground',
                        checked ? 'bg-foreground' : 'bg-card',
                    )}
                    aria-hidden
                >
                    {checked && <Check className="h-3.5 w-3.5 text-background" strokeWidth={2.6} />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-base leading-tight">{title}</span>
                    {description && (
                        <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">{description}</span>
                    )}
                </span>
                {badge && (
                    <span className="shrink-0 rounded-full bg-[hsl(var(--orange))]/10 px-2 py-1 text-[11px] font-extrabold uppercase tracking-[.1em] text-[hsl(var(--orange-deep))]">
                        {badge}
                    </span>
                )}
                {icon}
            </button>
            {checked && children ? <div className="px-3.5 pb-3.5">{children}</div> : null}
        </div>
    );
}
