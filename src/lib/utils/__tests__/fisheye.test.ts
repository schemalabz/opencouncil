import { fisheyeModeForDistance } from '../fisheye';

describe('fisheyeModeForDistance', () => {
    it('returns focus for the center segment and immediate neighbors', () => {
        expect(fisheyeModeForDistance(0)).toBe('focus');
        expect(fisheyeModeForDistance(1)).toBe('focus');
        expect(fisheyeModeForDistance(-1)).toBe('focus');
    });

    it('returns context for everything beyond distance 1', () => {
        expect(fisheyeModeForDistance(2)).toBe('context');
        expect(fisheyeModeForDistance(-2)).toBe('context');
        expect(fisheyeModeForDistance(50)).toBe('context');
        expect(fisheyeModeForDistance(-100)).toBe('context');
    });

    it('is symmetric around zero', () => {
        for (let d = 0; d < 10; d++) {
            expect(fisheyeModeForDistance(d)).toBe(fisheyeModeForDistance(-d));
        }
    });
});
