"use client"

import { useRef, type KeyboardEvent, type ReactNode } from 'react';

/** A text-only action: the quiet answer next to a filled button. */
export function QuietButton({ onClick, children, disabled, className }: {
    onClick: () => void;
    children: ReactNode;
    disabled?: boolean;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`whitespace-nowrap text-[13px] font-medium text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50 disabled:hover:no-underline ${className ?? ''}`}
        >
            {children}
        </button>
    );
}

export interface RadioOption {
    id: string;
    text: string;
    hint?: string | null;
}

const DOT = 'h-4 w-4 shrink-0 rounded-full border';
const DOT_ON = 'border-[5px] border-[hsl(var(--orange-deep))]';
const DOT_OFF = 'border-[1.5px] border-muted-foreground/60';

/**
 * One choice among a few, as a keyboard-complete radio group: the checked
 * item is the one tab stop, the arrow keys move the choice, Home and End jump.
 * `dense` is the inline form for a card row; the default stacks list rows.
 */
export function RadioList({ label, options, value, onChange, disabled = false, dense = false }: {
    label: string;
    options: RadioOption[];
    value: string | null;
    onChange: (id: string) => void;
    disabled?: boolean;
    dense?: boolean;
}) {
    const group = useRef<HTMLDivElement>(null);
    const checkedIndex = options.findIndex(option => option.id === value);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (disabled || options.length === 0) return;
        const current = Math.max(0, checkedIndex);
        let next: number;
        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowRight':
                next = (current + 1) % options.length;
                break;
            case 'ArrowUp':
            case 'ArrowLeft':
                next = (current - 1 + options.length) % options.length;
                break;
            case 'Home':
                next = 0;
                break;
            case 'End':
                next = options.length - 1;
                break;
            default:
                return;
        }
        event.preventDefault();
        onChange(options[next].id);
        group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
    };

    return (
        <div
            ref={group}
            role="radiogroup"
            aria-label={label}
            onKeyDown={onKeyDown}
            className={dense ? 'flex flex-col gap-0.5' : 'divide-y divide-border/60'}
        >
            {options.map((option, index) => {
                const checked = option.id === value;
                const tabbable = checkedIndex === -1 ? index === 0 : checked;
                return (
                    <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        tabIndex={tabbable ? 0 : -1}
                        disabled={disabled}
                        onClick={() => onChange(option.id)}
                        className={dense
                            ? 'inline-flex min-h-[30px] items-center gap-2.5 text-left text-[13.5px] disabled:opacity-60'
                            : 'flex min-h-10 w-full items-center gap-3 px-1 py-2 text-left text-[13.5px] hover:bg-muted/40 disabled:opacity-60 disabled:hover:bg-transparent'}
                    >
                        <span className={`${DOT} ${checked ? DOT_ON : DOT_OFF}`} aria-hidden />
                        <span className={checked ? 'font-medium' : undefined}>{option.text}</span>
                        {option.hint && <span className={`text-xs text-muted-foreground ${dense ? '' : 'ml-auto'}`}>{option.hint}</span>}
                    </button>
                );
            })}
        </div>
    );
}
