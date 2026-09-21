import type { CSSProperties, ReactNode } from 'react';
import Icon from '@/components/icon';
import { topicStyle } from '@/lib/topicStyle';
import { cn } from '@/lib/utils';

/**
 * The inline style a topic-tinted surface carries: the topic's wash, its ring,
 * and — as the surface's `color`, so a glyph on it can ask for `currentColor` —
 * whatever stays readable against the wash.
 *
 * `topicStyle` already decides the three colours; what was repeated at seven
 * call sites is the mapping of those three onto CSS properties, so a change to
 * the mapping reached only the surfaces whose author remembered them all.
 */
export function topicSurfaceStyle(
    colorHex: string | null | undefined,
    variant: 'soft' | 'solid' = 'soft',
): CSSProperties {
    const { background, border, icon } = topicStyle(colorHex, variant);
    return { backgroundColor: background, borderColor: border, color: icon };
}

/**
 * A topic named as a pill: the topic's wash, its glyph, its name. The static
 * form every surface that only names a topic shares. {@link TopicFilterPill} is
 * the form that a reader can pick.
 */
export function TopicPill({ label, icon, colorHex, className }: {
    label: string;
    icon: string | null;
    colorHex: string | null | undefined;
    className?: string;
}) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none',
                className,
            )}
            style={topicSurfaceStyle(colorHex)}
        >
            <Icon name={icon || 'hash'} color="currentColor" size={13} />
            {label}
        </span>
    );
}

/**
 * A topic offered as a filter: the pill a reader picks. The landing's category row, the landing's
 * search panel and the /search filter sheet each drew their own copy of this, and the three had
 * drifted; they now share this one.
 *
 * An idle pill carries its topic as ink only. The three copies carried it as a wash *and* as a
 * full-strength ring, which made every pill look picked; the real selection — the same hue, now
 * filled — was then the quietest difference in the row. A picked pill takes the fill, and a ring
 * in the foreground colour. The neutral "all" pill already fills with that near-black, so one mark
 * covers the whole row.
 *
 * The ring is what marks the pale topics. Τουρισμός at full strength clears 1.53:1 against the
 * idle pill beside it, and a difference in fill alone must clear 3:1.
 */
export function TopicFilterPill({
    active,
    onClick,
    color,
    icon,
    disabled,
    children,
}: {
    active: boolean;
    onClick: () => void;
    /** the topic's accent — the ink when idle, the fill when picked. Omit for the neutral "all" pill. */
    color?: string;
    /** the topic's lucide glyph; a topic pill without one falls back to `hash` */
    icon?: string | null;
    disabled?: boolean;
    children: ReactNode;
}) {
    const style = color ? topicStyle(color, active ? 'solid' : 'soft') : null;
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-pressed={active}
            style={
                style
                    ? active
                        ? topicSurfaceStyle(color, 'solid')
                        // The wash the idle pill keeps for its hover, as a variable: an inline
                        // `backgroundColor` would outrank the hover class.
                        : ({ color: style.icon, '--pill-wash': style.background } as CSSProperties)
                    : undefined
            }
            className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] font-bold transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50',
                color
                    ? active
                        ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
                        : 'border-border bg-background hover:bg-[var(--pill-wash)]'
                    : active
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-background text-muted-foreground hover:border-foreground/30',
            )}
        >
            {color && <Icon name={icon || 'hash'} color="currentColor" size={14} />}
            {children}
        </button>
    );
}
