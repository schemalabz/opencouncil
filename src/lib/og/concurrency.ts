// In-process concurrency cap for /api/og image rendering.
//
// This is a process-local guard. On a clustered/multi-instance deploy the effective cap
// is `OG_MAX_CONCURRENT_RENDERS × instances`, which is fine for sizing capacity.
//
// Tune with the OG_MAX_CONCURRENT_RENDERS env var (positive integer). Default: 2.

const DEFAULT_MAX = 2;

const MAX_CONCURRENT: number = (() => {
    const raw = process.env.OG_MAX_CONCURRENT_RENDERS;
    if (!raw) return DEFAULT_MAX;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX;
})();

let active = 0;

export interface OgSlot {
    release: () => void;
}

/**
 * Try to acquire a render slot. Returns null if the cap is already reached;
 * the caller should respond with 429 in that case.
 */
export function tryAcquireOgSlot(): OgSlot | null {
    if (active >= MAX_CONCURRENT) return null;
    active++;
    let released = false;
    return {
        release: () => {
            if (released) return;
            released = true;
            active--;
        },
    };
}

export function getOgConcurrencyStats(): { active: number; max: number } {
    return { active, max: MAX_CONCURRENT };
}
