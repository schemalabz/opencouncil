type UtteranceWithTimestamps = {
    id: string;
    startTimestamp: number;
    endTimestamp: number;
};

type SegmentWithUtterances<TUtterance extends UtteranceWithTimestamps> = {
    id: string;
    startTimestamp: number;
    endTimestamp: number;
    utterances: TUtterance[];
};

export function applyUtteranceDeletions<
    TUtterance extends UtteranceWithTimestamps,
    TSegment extends SegmentWithUtterances<TUtterance>
>(
    transcript: TSegment[],
    deletionsBySegment: Map<string, Set<string>>
): TSegment[] {
    if (deletionsBySegment.size === 0) {
        return transcript;
    }

    return transcript.map((segment) => {
        const deletedUtteranceIds = deletionsBySegment.get(segment.id);
        if (!deletedUtteranceIds || deletedUtteranceIds.size === 0) {
            return segment;
        }

        const updatedUtterances = segment.utterances.filter(
            (utterance) => !deletedUtteranceIds.has(utterance.id)
        ) as TSegment["utterances"];

        if (updatedUtterances.length === 0) {
            // Intentional design: We do not modify or zero out the segment's
            // startTimestamp and endTimestamp. Retaining the stale timestamps ensures
            // the empty segment maintains its correct chronological position in the UI,
            // perfectly mirroring the backend logic in deleteUtterance.
            return {
                ...segment,
                utterances: updatedUtterances,
            };
        }

        const allTimestamps = updatedUtterances.flatMap((utterance) => [
            utterance.startTimestamp,
            utterance.endTimestamp,
        ]);

        return {
            ...segment,
            utterances: updatedUtterances,
            startTimestamp: Math.min(...allTimestamps),
            endTimestamp: Math.max(...allTimestamps),
        };
    });
}

/**
 * Undoes `applyUtteranceDeletions` for a request that failed. It puts back only
 * the removed utterances, so edits made while the request was in flight stay.
 */
export function restoreUtteranceDeletions<
    TUtterance extends UtteranceWithTimestamps,
    TSegment extends SegmentWithUtterances<TUtterance>
>(
    transcript: TSegment[],
    removedBySegment: Map<string, TUtterance[]>
): TSegment[] {
    if (removedBySegment.size === 0) {
        return transcript;
    }

    return transcript.map((segment) => {
        const removed = removedBySegment.get(segment.id);
        if (!removed || removed.length === 0) {
            return segment;
        }

        const presentIds = new Set(segment.utterances.map((utterance) => utterance.id));
        const updatedUtterances = [
            ...segment.utterances,
            ...removed.filter((utterance) => !presentIds.has(utterance.id)),
        ].sort((a, b) => a.startTimestamp - b.startTimestamp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) as TSegment["utterances"];

        const allTimestamps = updatedUtterances.flatMap((utterance) => [
            utterance.startTimestamp,
            utterance.endTimestamp,
        ]);

        return {
            ...segment,
            utterances: updatedUtterances,
            startTimestamp: Math.min(...allTimestamps),
            endTimestamp: Math.max(...allTimestamps),
        };
    });
}

