// In-process concurrency cap for /api/og image rendering.
//
// This is a process-local guard. On a clustered/multi-instance deploy the effective cap
// is `MAX_CONCURRENT × instances`, which is fine for sizing capacity.
//
// The value is intentionally hardcoded — current staging/production load doesn't need a
// runtime tuning knob. If observation later shows we need per-environment tuning, lift
// MAX_CONCURRENT into an env var (e.g. OG_MAX_CONCURRENT_RENDERS) at that point. Until
// then, change the constant and redeploy.
const MAX_CONCURRENT = 2;

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
