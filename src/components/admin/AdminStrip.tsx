import { cn } from '@/lib/utils';

/**
 * The container that marks a row of back-of-house controls.
 *
 * Hazard stripes, because these sit on pages most of whose visitors are
 * citizens. The striping is the cheapest honest signal that the row is not part
 * of what they came for — it reads as scaffolding rather than as product, at a
 * glance and without a label to translate.
 *
 * Faded on purpose: it has to be legible as a boundary without competing with
 * whatever it sits beside.
 */
export function AdminStrip({ className, children }: { className?: string; children: React.ReactNode }) {
    return (
        <div
            className={cn(
                'flex flex-wrap items-center gap-1.5 rounded-xl border border-[hsl(var(--orange))]/20 p-1.5',
                className,
            )}
            style={{
                // The lowest alpha that still reads as a pattern rather than as a
                // rendering artefact.
                backgroundImage:
                    'repeating-linear-gradient(45deg, hsl(var(--orange) / 0.07) 0 6px, transparent 6px 14px)',
            }}
        >
            {children}
        </div>
    );
}

/**
 * What a control inside {@link AdminStrip} wears.
 *
 * The hover tints rather than greys: a neutral wash over 7%-alpha stripes reads
 * as a patch covering them, where staying in the stripe's own hue reads as the
 * same surface, warmer.
 */
export const adminToolClass =
    'h-8 rounded-[6px] px-2.5 text-xs text-muted-foreground hover:!bg-[hsl(var(--orange))]/[0.14] hover:text-foreground';
