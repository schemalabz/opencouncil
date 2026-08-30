import Icon from '@/components/icon';
import { topicStyle } from '@/lib/topicStyle';
import { cn } from '@/lib/utils';

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
    const style = topicStyle(colorHex);
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none',
                className,
            )}
            style={{ backgroundColor: style.background, borderColor: style.border, color: style.icon }}
        >
            <Icon name={icon || 'hash'} color="currentColor" size={13} />
            {label}
        </span>
    );
}
