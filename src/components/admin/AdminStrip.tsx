import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from '@/components/ui/button';

/**
 * The hazard pattern every back-of-house surface wears.
 *
 * One recipe, because the signal only works if it reads the same everywhere: a
 * reader learns the stripes once and then recognises them on a control row, on
 * a draft message and on an unreleased meeting alike. The alpha is the lowest
 * that still reads as a pattern rather than as a rendering artefact.
 */
export const adminStripes =
    'repeating-linear-gradient(45deg, hsl(var(--orange) / 0.07) 0 6px, transparent 6px 14px)';

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
            style={{ backgroundImage: adminStripes }}
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

/**
 * A control inside {@link AdminStrip}, wearing {@link adminToolClass} so no
 * call site re-assembles the ghost/sm/quiet recipe by hand. `destructive`
 * keeps the text red through adminToolClass's own hover-to-foreground.
 */
export function AdminToolButton({ destructive, className, ...props }: ButtonProps & { destructive?: boolean }) {
    return (
        <Button
            variant="ghost"
            size="sm"
            className={cn(adminToolClass, destructive && 'text-destructive hover:!text-destructive', className)}
            {...props}
        />
    );
}

/**
 * A frame around content that only staff can see.
 *
 * {@link AdminStrip} marks a row of controls; this marks the thing itself — a
 * message still in draft, a meeting not yet released. Same stripes, so the
 * signal is one thing to learn rather than two.
 *
 * The label is not decoration. Styling alone says "this is different" but never
 * says different how: a faded dashed border reads as a visual choice, and a
 * superadmin who misses it cannot tell a draft from something already public.
 * The word is what carries the meaning, so it is required rather than
 * defaulted, and every caller translates it.
 */
export function AdminOnly({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
    return (
        <div
            className={cn(
                'relative rounded-xl border border-[hsl(var(--orange))]/20 p-1.5 pt-5',
                className,
            )}
            style={{ backgroundImage: adminStripes }}
        >
            {/* Out of the flow: the frame should cost the content its padding
                and nothing more, so a card inside keeps the height the grid
                gave it. */}
            <span
                className="pointer-events-none absolute left-2.5 top-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[hsl(var(--orange))]/70"
            >
                {label}
            </span>
            {children}
        </div>
    );
}
