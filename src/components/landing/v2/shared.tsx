import { cn } from '@/lib/utils';
import type { TopicChip } from './mockData';

/** Category chip (borrowed from the reference cards) tinted with the topic's own color. */
export function TopicChipBadge({ topic, className }: { topic: TopicChip; className?: string }) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                className,
            )}
            style={{
                backgroundColor: `${topic.colorHex}1a`, // ~10% alpha
                color: topic.colorHex,
            }}
        >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: topic.colorHex }} />
            {topic.name}
        </span>
    );
}

const DATE_FMT = new Intl.DateTimeFormat('el-GR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
});
const TIME_FMT = new Intl.DateTimeFormat('el-GR', { hour: '2-digit', minute: '2-digit' });

export function formatMeetingDate(iso: string): { date: string; time: string } {
    const d = new Date(iso);
    return { date: DATE_FMT.format(d), time: TIME_FMT.format(d) };
}
