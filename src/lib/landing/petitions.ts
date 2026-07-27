/**
 * Petition-count display helpers for the landing's Δήμοι map: out-of-network municipalities with
 * enough petitions get a marker, coloured deeper the more petitions they have, and their exact
 * counts are never shown — only coarse "10+ / 25+ / 50+ / 100+" buckets.
 */

/** A municipality shows on the petition layer only at or past this many petitions. */
export const PETITION_DISPLAY_THRESHOLD = 10;

/** The coarse public form of a petition count — thresholds of the displayed "N+" buckets. */
export const PETITION_BUCKETS = [100, 50, 25, PETITION_DISPLAY_THRESHOLD] as const;
export type PetitionBucket = (typeof PETITION_BUCKETS)[number];

/** The bucket a count falls in, or null below the display threshold. */
export function petitionBucket(count: number): PetitionBucket | null {
    for (const b of PETITION_BUCKETS) if (count >= b) return b;
    return null;
}

/** The petition blue, defined once for every surface that speaks it. DOM surfaces use the space
 *  syntax (composable into color-mix); the map paints carry comma syntax, because mapbox-gl's
 *  colour parser predates space-separated hsl. One hue family — change it here or nowhere. */
export const PETITION_BLUE = {
    /** ramp endpoint + inline text accents */
    deep: 'hsl(212 55% 38%)',
    /** ramp endpoint */
    pale: 'hsl(212 60% 90%)',
    /** boundary fills on the Δήμοι view */
    mapFill: 'hsl(212, 55%, 50%)',
    /** passive boundary strokes */
    mapStroke: 'hsl(212, 55%, 45%)',
    /** the focused (clicked) δήμος's stroke */
    mapStrokeFocus: 'hsl(212, 55%, 40%)',
} as const;

/**
 * Where each count sits in the displayed set's own distribution, as 0..1 — this is what drives the
 * colour ramp, so "deep blue" always means "top of the current distribution" rather than some
 * absolute number that would leave every marker pale in a young deployment. Log-scaled, because
 * petition counts are long-tailed: linear scaling would let one big city flatten everyone else to
 * the bottom of the ramp.
 */
export function petitionIntensities(counts: number[]): number[] {
    const max = Math.max(...counts, PETITION_DISPLAY_THRESHOLD);
    if (max <= PETITION_DISPLAY_THRESHOLD) return counts.map(() => 1);
    const lo = Math.log(PETITION_DISPLAY_THRESHOLD);
    const span = Math.log(max) - lo;
    return counts.map((c) => Math.min(1, Math.max(0, (Math.log(Math.max(c, PETITION_DISPLAY_THRESHOLD)) - lo) / span)));
}
