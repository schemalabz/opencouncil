import { Transcript } from "../db/transcript";

export const UNKNOWN_SPEAKER_LABEL = "Άγνωστος Ομιλητής";

export const buildUnknownSpeakerLabel = (index: number) =>
    `${UNKNOWN_SPEAKER_LABEL} ${index}`;

function mergeUpdatedAt(
    currentUpdatedAt?: Date | null,
    nextUpdatedAt?: Date | null
): Date {
    if (currentUpdatedAt && nextUpdatedAt) {
        return new Date(Math.max(currentUpdatedAt.getTime(), nextUpdatedAt.getTime()));
    }

    return currentUpdatedAt ?? nextUpdatedAt ?? new Date();
}

export function joinTranscriptSegments(speakerSegments: Transcript): Transcript {
    if (speakerSegments.length === 0) {
        return speakerSegments;
    }

    const joinedSegments = [];
    let currentSegment = { ...speakerSegments[0] }; // Create a copy of the first segment

    for (let i = 1; i < speakerSegments.length; i++) {
        const nextSegment = speakerSegments[i];
        const canCompareTimestamps =
            typeof nextSegment.startTimestamp === 'number' &&
            typeof currentSegment.startTimestamp === 'number';

        if (nextSegment.speakerTag.personId && currentSegment.speakerTag.personId
            && nextSegment.speakerTag.personId === currentSegment.speakerTag.personId
            && canCompareTimestamps
            && nextSegment.startTimestamp >= currentSegment.startTimestamp) {
            const currentUpdatedAt = currentSegment.summary?.updatedAt;
            const nextUpdatedAt = nextSegment.summary?.updatedAt;
            const mergedUpdatedAt = mergeUpdatedAt(currentUpdatedAt, nextUpdatedAt);

            // Join adjacent segments with the same speaker
            currentSegment = {
                ...currentSegment,
                summary: currentSegment.summary || nextSegment.summary ? {
                    id: currentSegment.summary?.id || nextSegment.summary?.id || '',
                    createdAt: currentSegment.summary?.createdAt || nextSegment.summary?.createdAt || new Date(),
                    updatedAt: mergedUpdatedAt,
                    speakerSegmentId: currentSegment.summary?.speakerSegmentId || nextSegment.summary?.speakerSegmentId || currentSegment.id,
                    text: [currentSegment.summary?.text, nextSegment.summary?.text].filter(Boolean).join(" || ") || '',
                    type: currentSegment.summary?.type === 'substantive' || nextSegment.summary?.type === 'substantive' ? 'substantive' : 'procedural'
                } : null,
                endTimestamp: Math.max(currentSegment.endTimestamp, nextSegment.endTimestamp),
                utterances: [...currentSegment.utterances, ...nextSegment.utterances],
                topicLabels: [...currentSegment.topicLabels, ...nextSegment.topicLabels]
            };
        } else {
            // Push the current segment and start a new one
            joinedSegments.push(currentSegment);
            currentSegment = { ...nextSegment };
        }
    }

    // Push the last segment
    joinedSegments.push(currentSegment);

    return joinedSegments;
}
