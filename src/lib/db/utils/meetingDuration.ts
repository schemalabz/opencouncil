/**
 * Calculate meeting duration from utterances
 * Returns duration in milliseconds
 */
export function calculateMeetingDurationMs(meeting: {
    speakerSegments: Array<{
        utterances: Array<{
            startTimestamp: number;
            endTimestamp: number;
        }>;
    }>;
}): number {
    if (meeting.speakerSegments.length === 0) {
        return 0;
    }

    const allTimestamps: number[] = [];
    meeting.speakerSegments.forEach(segment => {
        segment.utterances.forEach(utterance => {
            allTimestamps.push(utterance.startTimestamp);
            allTimestamps.push(utterance.endTimestamp);
        });
    });

    if (allTimestamps.length === 0) {
        return 0;
    }

    const minTimestamp = Math.min(...allTimestamps);
    const maxTimestamp = Math.max(...allTimestamps);
    return (maxTimestamp - minTimestamp) * 1000; // Convert to ms
}

