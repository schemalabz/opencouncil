import { cn } from '@/lib/utils';
import { surfaceCardClass } from '@/components/ui/surface-card';

/**
 * A titled card for a page's side rail — the compact "facts" column the
 * subject, person, and party pages set beside their main content. The title
 * is a div, not a heading element, so the global `h2` rule (2xl, centered)
 * cannot reach it.
 */
export function RailCard({ title, children, className }: {
    title: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn(surfaceCardClass, 'px-4 py-3.5', className)}>
            <div className="mb-2.5 text-[11px] font-extrabold tracking-[.04em] text-muted-foreground">{title}</div>
            {children}
        </div>
    );
}
