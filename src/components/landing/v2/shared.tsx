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

/** Uppercase, letter-spaced label (the design's "eyebrow"). */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <span
            className={cn(
                'text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground',
                className,
            )}
        >
            {children}
        </span>
    );
}

/** Pulsing orange "live" indicator with a label. */
export function LiveDot({ label = 'Live', className }: { label?: string; className?: string }) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#c2470a]',
                className,
            )}
        >
            <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#fc550a] opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#fc550a]" />
            </span>
            {label}
        </span>
    );
}

/** Diagonal-striped image placeholder with an uppercase label (from the design). */
export function StripedPlaceholder({
    label = 'Φωτογραφία',
    accent,
    className,
}: {
    label?: string;
    accent?: boolean;
    className?: string;
}) {
    const stripe = accent ? 'rgba(252,85,10,0.12)' : 'rgba(0,0,0,0.06)';
    return (
        <div
            aria-hidden
            className={cn(
                'flex items-center justify-center overflow-hidden rounded-3xl border border-border',
                className,
            )}
            style={{
                backgroundColor: accent ? 'rgba(252,85,10,0.06)' : 'hsl(var(--muted))',
                backgroundImage: `repeating-linear-gradient(135deg, ${stripe} 0 2px, transparent 2px 11px)`,
            }}
        >
            <span className="rounded px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {label}
            </span>
        </div>
    );
}

/** Small pill tag. */
export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-bold text-muted-foreground',
                className,
            )}
        >
            {children}
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
