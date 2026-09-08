import type { CSSProperties } from 'react';
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
 * form the subject header and the hot-topic lead share — the search pages'
 * interactive topic buttons keep their own richer anatomy.
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
