/**
 * Compute the min start / max end timestamps across a set of utterances.
 *
 * Uses a single loop instead of `Math.min(...timestamps)` so that very large
 * transcripts don't exceed the engine's argument-count limit (stack overflow).
 */
export function getTimestampBounds(
    utterances: Array<{ startTimestamp: number; endTimestamp: number }>
): { startTimestamp: number; endTimestamp: number } | null {
    if (utterances.length === 0) return null;

    let min = Infinity;
    let max = -Infinity;
    for (const u of utterances) {
        min = Math.min(min, u.startTimestamp, u.endTimestamp);
        max = Math.max(max, u.startTimestamp, u.endTimestamp);
    }
    return { startTimestamp: min, endTimestamp: max };
}
