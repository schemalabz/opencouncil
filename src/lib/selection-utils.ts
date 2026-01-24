/**
 * Calculates a range of utterance IDs between two utterances.
 * Returns all utterance IDs from start to end (inclusive).
 */
export function calculateUtteranceRange(
    allUtterances: { id: string }[],
    startId: string,
    endId: string
): string[] {
    const startIndex = allUtterances.findIndex(u => u.id === startId);
    const endIndex = allUtterances.findIndex(u => u.id === endId);
    
    if (startIndex === -1 || endIndex === -1) return [];
    
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);
    
    return allUtterances.slice(start, end + 1).map(u => u.id);
}

