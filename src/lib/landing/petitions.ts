/**
 * Petition-count display helpers for the landing's Δήμοι map: out-of-network municipalities with
 * enough petitions get a marker, coloured deeper the more petitions they have, and their exact
 * counts are never shown — only coarse "10+ / 25+ / 50+ / 100+" buckets.
 *
 * PRIVACY INVARIANTS (do not weaken):
 * - Nothing about the petitionERS ever reaches a client: the queries aggregate with COUNT only and
 *   never select user ids, names, emails, or timestamps of individual petitions.
 * - Which municipalities sit below the display threshold is never revealed: they leave the server
 *   only as one aggregate integer ("N more δήμοι under 10"), never as a list.
 *
 * Deliberately NOT an invariant: hiding the exact counts of displayed municipalities. The
 * intensity is a full-precision function of the count and the leaderboard ranks by true count —
 * we already publish a coarse bucket against a *named* δήμος, so exact counts are presentation
 * coarseness, not a secret. (An earlier revision quantised the intensity to prevent inversion;
 * that bought nothing and made leaderboard ordinals contradict the badges. Don't restore it.)
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

/** The public payload for one petitioned municipality — every field a client may learn. */
export type PetitionedCity = {
    id: string;
    name: string;
    nameMunicipality: string;
    logoImage: string | null;
    /** boundary centroid — null when the δήμος has no geometry yet (it still makes the
     *  leaderboard; it just has no map bubble and can't be focused) */
    lng: number | null;
    lat: number | null;
    geometry: GeoJSON.Geometry | null;
    /** the "N+" the visitor may see (see PETITION_BUCKETS) */
    bucket: PetitionBucket;
    /** 0..1 position in the displayed set's own (log-scaled) distribution — drives the colour ramp */
    intensity: number;
};

/** The raw aggregate row the petitioned-cities query produces (see getPetitionedMapCitiesCached). */
export type PetitionedCityQueryRow = {
    id: string;
    name: string;
    name_municipality: string;
    logoImage: string | null;
    lng: number | null;
    lat: number | null;
    geometry: string | null;
    petitions: number;
};

/**
 * The pure mapping from aggregate query rows (already ranked: count DESC, name) to the public
 * payload. The exact count is consumed here — into a bucket and a ramp position — and never
 * forwarded. Field-by-field on purpose: the key set of the output IS the privacy surface, and the
 * payload test pins it, so widening the SELECT (or spreading the row) cannot silently ship more.
 */
export function buildPetitionedCities(rows: PetitionedCityQueryRow[]): PetitionedCity[] {
    const intensities = petitionIntensities(rows.map((r) => Number(r.petitions)));
    return rows.map((r, i) => ({
        id: r.id,
        name: r.name,
        nameMunicipality: r.name_municipality,
        logoImage: r.logoImage,
        lng: r.lng == null ? null : Number(r.lng),
        lat: r.lat == null ? null : Number(r.lat),
        geometry: r.geometry ? (JSON.parse(r.geometry) as GeoJSON.Geometry) : null,
        // non-null by the query's HAVING clause
        bucket: petitionBucket(Number(r.petitions))!,
        intensity: intensities[i],
    }));
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

/** The petition colour ramp: brand blue, deeper the higher the δήμος sits in the displayed
 *  distribution. The floor keeps even the palest surface clearly blue rather than near-white.
 *  Shared by the map bubbles and the Δήμοι-list leaderboard so "how blue" means one thing. */
export function petitionFill(intensity: number): { background: string; text: string } {
    const pct = Math.round(25 + 75 * intensity);
    return {
        background: `color-mix(in srgb, ${PETITION_BLUE.deep} ${pct}%, ${PETITION_BLUE.pale})`,
        // The badges are 12px text, so WCAG AA wants 4.5:1. Neither white nor near-black clears
        // that across the whole ramp with a mid-ramp switch — white only reaches 4.5:1 from
        // pct ≈ 85, so that's where the flip lives (worst case 4.78:1, measured; see the
        // contrast test).
        text: pct >= 85 ? '#ffffff' : '#000000',
    };
}

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
