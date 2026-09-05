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
