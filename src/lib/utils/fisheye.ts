export type SegmentDisplayMode = 'full' | 'summary' | 'stripe';

export const NEAR_RADIUS = 2;

export function getDisplayModeForDistance(distance: number, isFishEyeMode: boolean): SegmentDisplayMode {
    if (!isFishEyeMode) {
        return 'full';
    }
    
    if (distance === 0) {
        return 'full';
    }
    
    if (distance <= NEAR_RADIUS) {
        return 'summary';
    }
    
    return 'stripe';
}

export function getSegmentDisplayMode(
    segmentIndex: number,
    centerIndex: number,
    isFishEyeMode: boolean
): SegmentDisplayMode {
    if (!isFishEyeMode) {
        return 'full';
    }
    
    const distance = Math.abs(segmentIndex - centerIndex);
    return getDisplayModeForDistance(distance, isFishEyeMode);
}

export function getSummaryText(segment: { summary?: { text: string } | null; utterances: { text: string }[] }): string {
    if (segment.summary?.text) {
        return segment.summary.text;
    }
    
    const fullText = segment.utterances.map(u => u.text).join(' ');
    if (fullText.length <= 100) {
        return fullText;
    }
    
    return fullText.slice(0, 100) + '...';
}
