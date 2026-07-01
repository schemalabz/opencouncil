import { Location } from '@/lib/types/onboarding';
import { encodeGeohash } from '@/lib/geo';

/**
 * Promo for OSEK TUTU (https://osektutu.space), a neighbourhood organising platform.
 *
 * osektutu organises Athens neighbourhoods on a geohash-6 grid, of which only a
 * pilot set is currently active. When a user finishes the OpenCouncil notification
 * signup and one of their selected locations falls inside an active tile, we surface
 * a promo banner inviting them to their "micro-neighbourhood".
 *
 * The active tile list is hardcoded for the pilot. It can later move to an env var
 * or the database without changing the matching logic. See issue #416.
 */

export const OSEKTUTU_URL = 'https://osektutu.space/?utm_source=open_council';

// Geohash-6 tiles of the currently active osektutu neighbourhoods, keyed by tile.
// Source: OSEK TUTU pilot tile export (OT_pilot_geohash6_tiles.csv).
const OSEKTUTU_ACTIVE_TILES: Record<string, string> = {
    // Kypseli
    swbb5u: 'Kypseli',
    swbb5y: 'Kypseli',
    swbb5v: 'Kypseli',
    swbbhh: 'Kypseli',
    swbbhj: 'Kypseli',
    swbbhn: 'Kypseli',
    swbbhp: 'Kypseli',
    swbbhq: 'Kypseli',
    swbbhr: 'Kypseli',
    swbbhm: 'Kypseli',
    // Pangrati
    swbbh2: 'Pangrati',
    sw8zur: 'Pangrati',
    sw8zuq: 'Pangrati',
    sw8zup: 'Pangrati',
    sw8zux: 'Pangrati',
    swbbh3: 'Pangrati',
    swbbh9: 'Pangrati',
    sw8zun: 'Pangrati',
    // Vrilissia
    swbbqm: 'Vrilissia',
    swbbqh: 'Vrilissia',
    swbbq5: 'Vrilissia',
    swbbq7: 'Vrilissia',
    swbbqk: 'Vrilissia',
    swbbqd: 'Vrilissia',
    swbbqg: 'Vrilissia',
    swbbqt: 'Vrilissia',
    swbbqs: 'Vrilissia',
    swbbqe: 'Vrilissia',
    swbbq6: 'Vrilissia',
    swbbqw: 'Vrilissia',
    swbbqq: 'Vrilissia',
};

const GEOHASH_PRECISION = 6;

/**
 * Returns the active osektutu neighbourhood for the first selected location that
 * falls inside an active geohash-6 tile, or null if none match.
 */
export function findOsektutuNeighbourhood(locations: Location[]): string | null {
    for (const location of locations) {
        const tile = encodeGeohash(location.coordinates, GEOHASH_PRECISION);
        const neighbourhood = OSEKTUTU_ACTIVE_TILES[tile];
        if (neighbourhood) {
            return neighbourhood;
        }
    }
    return null;
}
