import { isValidLngLat } from './landingData';

/** The map camera as persisted between visits. */
export type SavedView = { center: [number, number]; zoom: number };

const KEY = 'oc:landing:view';

/**
 * Views go stale. Someone returning a month later is starting a new errand, not resuming the old
 * one, and dropping them somewhere they don't remember choosing reads as a bug. Past this age the
 * saved view is discarded and the server's framing wins.
 */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Saved zoom is capped here. Someone who left the map zoomed onto a single street doesn't want to
 * reopen on that street with no context around it; restoring at δήμος-ish level gives them back
 * where they were plus something to orient by. Only the stored value is clamped — the live map
 * still zooms as far as it likes.
 */
const MAX_SAVED_ZOOM = 14;

/** Narrow untrusted localStorage JSON to a fresh, well-formed view. Anything off → null. */
function parseSavedView(raw: string): SavedView | null {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    const { center, zoom, at } = data as Record<string, unknown>;
    if (typeof at !== 'number' || !Number.isFinite(at) || Date.now() - at > MAX_AGE_MS) return null;
    // The ceiling here (24, Mapbox's absolute max) is deliberately looser than write's MAX_SAVED_ZOOM
    // cap: read only rejects impossible values, so an entry written before the cap changed still
    // restores rather than being thrown away. write() is what enforces the product-level limit.
    if (typeof zoom !== 'number' || !Number.isFinite(zoom) || zoom < 0 || zoom > 24) return null;
    if (!Array.isArray(center) || center.length !== 2) return null;
    const [lng, lat] = center;
    if (typeof lng !== 'number' || typeof lat !== 'number' || !isValidLngLat(lng, lat)) return null;
    return { center: [lng, lat], zoom };
}

/**
 * The camera this visitor last left the map on, or null when there isn't a usable one — no
 * previous visit, a stale or corrupt entry, or localStorage being unavailable (Safari private
 * mode throws on access, and this runs on the server too, where there's no window at all).
 */
export function readSavedView(): SavedView | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(KEY);
        return raw ? parseSavedView(raw) : null;
    } catch {
        return null;
    }
}

/** Persist the camera, clamped to MAX_SAVED_ZOOM. Best-effort: a full or blocked localStorage
 *  must never break the map. */
export function writeSavedView(view: SavedView): void {
    if (typeof window === 'undefined') return;
    // Clamp both ends so write stays self-consistent with parseSavedView (which rejects zoom < 0):
    // a caller passing a negative zoom would otherwise be stored and then accepted on the next read.
    const stored = { ...view, zoom: Math.max(0, Math.min(view.zoom, MAX_SAVED_ZOOM)), at: Date.now() };
    try {
        window.localStorage.setItem(KEY, JSON.stringify(stored));
    } catch {
        // quota exceeded / private mode / storage disabled — the map works fine without this
    }
}
