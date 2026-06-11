/**
 * @jest-environment node
 */
import { tryAcquireOgSlot, getOgConcurrencyStats } from '../concurrency';

describe('og concurrency semaphore', () => {
    it('caps slots at max, reopens after release, and is idempotent on double-release', () => {
        const { max } = getOgConcurrencyStats();
        expect(max).toBe(2);
        expect(getOgConcurrencyStats().active).toBe(0);

        const slot1 = tryAcquireOgSlot();
        expect(slot1).not.toBeNull();
        expect(getOgConcurrencyStats().active).toBe(1);

        const slot2 = tryAcquireOgSlot();
        expect(slot2).not.toBeNull();
        expect(getOgConcurrencyStats().active).toBe(2);

        // Cap reached — third acquire returns null instead of queueing.
        expect(tryAcquireOgSlot()).toBeNull();
        expect(getOgConcurrencyStats().active).toBe(2);

        slot1!.release();
        expect(getOgConcurrencyStats().active).toBe(1);

        // Slot reopens after release.
        const slot3 = tryAcquireOgSlot();
        expect(slot3).not.toBeNull();
        expect(getOgConcurrencyStats().active).toBe(2);

        // Double-release on the same slot must not double-decrement.
        slot1!.release();
        expect(getOgConcurrencyStats().active).toBe(2);

        slot2!.release();
        slot3!.release();
        expect(getOgConcurrencyStats().active).toBe(0);
    });
});
