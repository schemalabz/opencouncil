import { meterBarWidth } from '../subjects';

describe('meterBarWidth', () => {
    it('draws a ratio as its percentage', () => {
        expect(meterBarWidth(0.42)).toBeCloseTo(42, 5);
    });

    it('floors a ratio that would render as a hairline', () => {
        expect(meterBarWidth(0.001)).toBe(6);
    });

    it('never overflows its own track', () => {
        // A rail card whose max is not the largest row — the bar drew wider than
        // the track it sits in.
        expect(meterBarWidth(1.4)).toBe(100);
    });

    it('floors the ratios a division produces when there is nothing to compare against', () => {
        expect(meterBarWidth(0 / 0)).toBe(6);
        expect(meterBarWidth(120 / 0)).toBe(6);
    });
});
