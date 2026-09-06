'use client';

import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

/**
 * A card that is a checkbox. The whole header is the checkbox's label, so
 * tapping anywhere on it toggles; the body — a phone field, the reader's
 * own words — shows only while it is on, and stays outside the label so
 * typing in it never flips the card. The box itself is the app's checkbox,
 * so a tick looks the same here as everywhere else. A ticked card stays
 * white and lifts: an orange halo and a warm shadow, so the choice reads
 * without the whole card turning orange.
 */
export function CardCheckbox({
    checked,
    onToggle,
    title,
    description,
    badge,
    icon,
    children,
}: {
    checked: boolean;
    onToggle: () => void;
    title: string;
    description?: string;
    badge?: string;
    icon?: React.ReactNode;
    children?: React.ReactNode;
}) {
    const id = useId();
    return (
        <div
            className={cn(
                'rounded-2xl border bg-card transition-[border-color,box-shadow] duration-300 ease-out',
                checked
                    ? 'border-[hsl(var(--orange))]/60 shadow-[0_0_0_2px_hsl(var(--orange)/0.08),0_6px_18px_-12px_hsl(var(--orange)/0.35)]'
                    : 'border-foreground/15 shadow-none',
            )}
        >
            <label htmlFor={id} className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 px-3.5 py-3">
                <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={onToggle}
                    className="h-[22px] w-[22px] rounded-[6px] border-foreground/60 [&_svg]:h-4 [&_svg]:w-4"
                />
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
            </label>
            {checked && children ? <div className="px-3.5 pb-3.5">{children}</div> : null}
        </div>
    );
}
