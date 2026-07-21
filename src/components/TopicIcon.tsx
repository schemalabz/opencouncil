'use client';

import Icon from '@/components/icon';
import { cn } from '@/lib/utils';
import { topicStyle } from '@/lib/topicStyle';

/** Icon box sizes. `sm` for inline chips, `md` for cards and headers, `lg` for a page's own header. */
const SIZES = {
    sm: { pad: 'p-1', icon: 14 },
    md: { pad: 'p-1.5', icon: 16 },
    lg: { pad: 'p-2', icon: 24 },
} as const;

/**
 * A subject topic as a round icon badge — the shape repeated across subject cards, the subject
 * page header, contribution cards and the map's own (plain-DOM) pins.
 *
 * Colours come from topicStyle, so every surface tints the same topic identically; before this each
 * one mixed its own alpha and the same topic read differently depending where you saw it. Falls back
 * to a neutral grey and a "hash" glyph when a subject has no topic.
 */
export function TopicIcon({
    color,
    icon,
    size = 'md',
    /** the picked-out state — topic at full strength with a white glyph */
    solid = false,
    className,
}: {
    color?: string | null;
    icon?: string | null;
    size?: keyof typeof SIZES;
    solid?: boolean;
    className?: string;
}) {
    const style = topicStyle(color, solid ? 'solid' : 'soft');
    const { pad, icon: iconSize } = SIZES[size];
    return (
        <span
            className={cn('inline-flex shrink-0 items-center justify-center rounded-full border', pad, className)}
            style={{ backgroundColor: style.background, borderColor: style.border }}
        >
            <Icon name={icon || 'hash'} color={style.icon} size={iconSize} />
        </span>
    );
}
