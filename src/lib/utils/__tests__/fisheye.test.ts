import { getDisplayModeForDistance, getSegmentDisplayMode, getSummaryText, NEAR_RADIUS, SegmentDisplayMode } from '../fisheye';

describe('fisheye utils', () => {
    describe('getDisplayModeForDistance', () => {
        it('returns full mode when not in fish-eye mode', () => {
            expect(getDisplayModeForDistance(0, false)).toBe('full');
            expect(getDisplayModeForDistance(1, false)).toBe('full');
            expect(getDisplayModeForDistance(100, false)).toBe('full');
        });

        it('returns full mode for center segment (distance 0)', () => {
            expect(getDisplayModeForDistance(0, true)).toBe('full');
        });

        it('returns summary mode for near segments', () => {
            for (let i = 1; i <= NEAR_RADIUS; i++) {
                expect(getDisplayModeForDistance(i, true)).toBe('summary');
            }
        });

        it('returns stripe mode for far segments', () => {
            expect(getDisplayModeForDistance(NEAR_RADIUS + 1, true)).toBe('stripe');
            expect(getDisplayModeForDistance(100, true)).toBe('stripe');
        });
    });

    describe('getSegmentDisplayMode', () => {
        it('returns full mode when not in fish-eye mode', () => {
            expect(getSegmentDisplayMode(0, 5, false)).toBe('full');
            expect(getSegmentDisplayMode(10, 5, false)).toBe('full');
        });

        it('returns full mode for center segment', () => {
            expect(getSegmentDisplayMode(5, 5, true)).toBe('full');
        });

        it('returns summary mode for segments within NEAR_RADIUS', () => {
            expect(getSegmentDisplayMode(4, 5, true)).toBe('summary');
            expect(getSegmentDisplayMode(6, 5, true)).toBe('summary');
            expect(getSegmentDisplayMode(3, 5, true)).toBe('summary');
            expect(getSegmentDisplayMode(7, 5, true)).toBe('summary');
        });

        it('returns stripe mode for segments outside NEAR_RADIUS', () => {
            expect(getSegmentDisplayMode(0, 5, true)).toBe('stripe');
            expect(getSegmentDisplayMode(10, 5, true)).toBe('stripe');
        });
    });

    describe('getSummaryText', () => {
        it('returns summary text when available', () => {
            const segment = {
                summary: { text: 'This is a summary' },
                utterances: [{ text: 'Full utterance text' }]
            };
            expect(getSummaryText(segment as any)).toBe('This is a summary');
        });

        it('falls back to truncated utterance text when no summary', () => {
            const segment = {
                summary: null,
                utterances: [{ text: 'Short text' }]
            };
            expect(getSummaryText(segment as any)).toBe('Short text');
        });

        it('truncates long utterance text with ellipsis', () => {
            const longText = 'A'.repeat(150);
            const segment = {
                summary: null,
                utterances: [{ text: longText }]
            };
            const result = getSummaryText(segment as any);
            expect(result.length).toBe(103); // 100 chars + '...'
            expect(result.endsWith('...')).toBe(true);
        });

        it('returns full text if under 100 characters', () => {
            const segment = {
                summary: null,
                utterances: [{ text: 'Short text' }]
            };
            expect(getSummaryText(segment as any)).toBe('Short text');
        });
    });
});
