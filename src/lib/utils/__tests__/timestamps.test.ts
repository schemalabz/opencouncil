import { getTimestampBounds } from '../timestamps';

describe('getTimestampBounds', () => {
    it('returns null for empty input', () => {
        expect(getTimestampBounds([])).toBeNull();
    });

    it('returns bounds for a single utterance', () => {
        expect(getTimestampBounds([{ startTimestamp: 5, endTimestamp: 10 }])).toEqual({
            startTimestamp: 5,
            endTimestamp: 10,
        });
    });

    it('returns bounds across unsorted utterances', () => {
        const utterances = [
            { startTimestamp: 20, endTimestamp: 30 },
            { startTimestamp: 5, endTimestamp: 12 },
            { startTimestamp: 8, endTimestamp: 40 },
        ];
        expect(getTimestampBounds(utterances)).toEqual({ startTimestamp: 5, endTimestamp: 40 });
    });

    it('propagates NaN like Math.min/Math.max', () => {
        const bounds = getTimestampBounds([
            { startTimestamp: 1, endTimestamp: NaN },
            { startTimestamp: 3, endTimestamp: 4 },
        ]);
        expect(bounds?.startTimestamp).toBeNaN();
        expect(bounds?.endTimestamp).toBeNaN();
    });

    it('handles very large inputs without exceeding the argument limit', () => {
        const utterances = Array.from({ length: 250_000 }, (_, i) => ({
            startTimestamp: i + 1,
            endTimestamp: i + 1.5,
        }));
        expect(getTimestampBounds(utterances)).toEqual({
            startTimestamp: 1,
            endTimestamp: 250_000.5,
        });
    });
});
