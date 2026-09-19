/**
 * The app's resting card surface: hairline border, 16px radius, card ground.
 *
 * One string so the decision exists once — the city page had grown its own
 * darker copy (`border-foreground/60`) beside the meeting pages' hairline, and
 * seven components each carried the recipe by hand. Compose per-site extras
 * (`overflow-hidden`, padding, hover) through `cn`; a caller that needs a
 * different border colour (e.g. an upcoming meeting's orange) appends it and
 * twMerge lets the override win.
 */
// border-foreground/15 sits between the hairline (--border, L≈90) and the old
// heavy border (foreground/60, L≈42): present, but not a frame.
export const surfaceCardClass = 'rounded-2xl border border-foreground/15 bg-card';

/**
 * The content column and the rail: single column below `lg`, two columns above
 * it. The rail holds one width at every size above `lg`.
 *
 * The person page and the party page use this one. Keep the `xl:` step out of
 * it: those two pages never had it, and folding it in here widened their rail
 * from 316px to 336px on a large screen without anyone asking for it.
 */
export const TWO_COLUMN_GRID_NARROW_RAIL = 'grid gap-8 lg:grid-cols-[minmax(0,1fr)_316px] lg:gap-10';

/**
 * The same two columns, plus a wider rail and a wider gutter above `xl`. The
 * subject page and the meeting decisions page use this one — their rail carries
 * the decision record, which reads better with the extra 20px.
 */
export const TWO_COLUMN_GRID = `${TWO_COLUMN_GRID_NARROW_RAIL} xl:grid-cols-[minmax(0,1fr)_336px] xl:gap-14`;
