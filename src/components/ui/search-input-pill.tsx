"use client";

import { Search, X } from "lucide-react";
import type { CSSProperties, KeyboardEvent, RefObject } from "react";
import { cn } from "@/lib/utils";

/* Icon · input · clear-button pill, shared by the landing page's map search and the /search
   page's query box. Callers own the Enter-key behavior (submit a query vs. detect a
   category/municipality/address) via `onKeyDown`. */
const SIZE_STYLES = {
    default: {
        wrapper: "h-11 gap-2.5 px-4",
        icon: "h-4 w-4",
        input: "text-[15px]",
        clearButton: "h-6 w-6",
        clearIcon: "h-4 w-4",
    },
    lg: {
        wrapper: "h-14 gap-3 px-5",
        icon: "h-5 w-5",
        input: "text-base",
        clearButton: "h-7 w-7",
        clearIcon: "h-4 w-4",
    },
} as const;

export function SearchInputPill({
    value,
    onChange,
    onKeyDown,
    onFocus,
    placeholder,
    ariaLabel,
    clearAriaLabel,
    inputRef,
    autoFocus,
    disabled,
    size = "default",
    combobox,
    className,
    style,
}: {
    value: string;
    onChange: (value: string) => void;
    onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
    onFocus?: () => void;
    placeholder: string;
    ariaLabel?: string;
    clearAriaLabel: string;
    inputRef: RefObject<HTMLInputElement | null>;
    autoFocus?: boolean;
    disabled?: boolean;
    size?: keyof typeof SIZE_STYLES;
    /**
     * Present when the input drives a list of options rendered elsewhere in the
     * DOM. The three attributes travel together because none of them means
     * anything alone: a combobox role without `expanded` is invalid, and an
     * active option nothing points at is invisible to a screen reader.
     */
    combobox?: { expanded: boolean; activeOptionId?: string };
    className?: string;
    style?: CSSProperties;
}) {
    const sizeStyles = SIZE_STYLES[size];
    return (
        <label
            style={style}
            className={cn(
                "flex flex-1 items-center rounded-2xl border focus-within:ring-2 focus-within:ring-[hsl(var(--orange))]/25",
                sizeStyles.wrapper,
                disabled && "opacity-60",
                className,
            )}
        >
            <Search className={cn("shrink-0 text-[hsl(var(--orange))]", sizeStyles.icon)} />
            <input
                ref={inputRef}
                autoFocus={autoFocus}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={onFocus}
                disabled={disabled}
                aria-label={ariaLabel}
                role={combobox ? "combobox" : undefined}
                aria-expanded={combobox?.expanded}
                aria-autocomplete={combobox ? "list" : undefined}
                aria-activedescendant={combobox?.activeOptionId}
                className={cn(
                    "w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed",
                    sizeStyles.input,
                )}
                placeholder={placeholder}
            />
            {value && !disabled && (
                <button
                    type="button"
                    aria-label={clearAriaLabel}
                    onClick={() => {
                        onChange("");
                        inputRef.current?.focus();
                    }}
                    className={cn(
                        "flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                        sizeStyles.clearButton,
                    )}
                >
                    <X className={sizeStyles.clearIcon} />
                </button>
            )}
        </label>
    );
}
