"use client";

import { cn } from '@/lib/utils';

/**
 * Two or more text options separated by bars; the active one is underlined.
 * The public meeting page and the decisions page share it.
 * An undefined value highlights no option.
 */
export function InlineToggle<T extends string>({ options, value, onChange, className }: {
    options: Array<{ value: T; label: string; disabled?: boolean; title?: string }>;
    value: T | undefined;
    onChange: (value: T) => void;
    className?: string;
}) {
    return (
        <div className={cn('flex items-center gap-2 text-xs sm:text-sm', className)}>
            {options.map((o, i) => (
                <span key={o.value} className="contents">
                    {i > 0 && <span className="text-muted-foreground/40">|</span>}
                    <button
                        type="button"
                        disabled={o.disabled}
                        title={o.title}
                        onClick={() => onChange(o.value)}
                        className={cn(
                            'transition-colors',
                            value === o.value ? 'text-primary underline underline-offset-4' : 'text-muted-foreground hover:text-foreground',
                            o.disabled && 'cursor-not-allowed hover:text-muted-foreground',
                        )}
                    >
                        {o.label}
                    </button>
                </span>
            ))}
        </div>
    );
}
