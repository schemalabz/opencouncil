import { cn } from '@/lib/utils';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { meterBarWidth } from '@/lib/utils/subjects';

/**
 * A titled card for a page's side rail — the compact "facts" column the
 * subject, person, and party pages set beside their main content. The title
 * is a div, not a heading element, so the global `h2` rule (2xl, centered)
 * cannot reach it.
 */
export function RailCard({ title, children, className, id }: {
    title: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    /** Anchor target — e.g. the subject page's #decision deep link. */
    id?: string;
}) {
    return (
        <div id={id} className={cn(surfaceCardClass, 'px-4 py-3.5', className)}>
            <div className="mb-2.5 text-[11px] font-extrabold tracking-[.04em] text-muted-foreground">{title}</div>
            {children}
        </div>
    );
}

/**
 * One measured row inside a rail card: a label, a count, and a thin bar scaled
 * against the card's largest value by {@link meterBarWidth}, which floors the
 * smallest value into a visible presence and caps the bar at its own track.
 */
export function RailMeterRow({ icon, label, value, ratio, color }: {
    icon?: React.ReactNode;
    label: React.ReactNode;
    value: React.ReactNode;
    /** This row's share of the card's largest value, 0..1. */
    ratio: number;
    color: string;
}) {
    return (
        <li>
            <div className="flex items-baseline justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
                    {icon}
                    <span className="truncate">{label}</span>
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{value}</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                <div
                    className="h-full rounded-full"
                    style={{ width: `${meterBarWidth(ratio)}%`, backgroundColor: color }}
                />
            </div>
        </li>
    );
}
