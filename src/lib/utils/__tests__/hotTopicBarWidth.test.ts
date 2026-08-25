import { hotTopicBarWidth } from '../subjects';

describe('hotTopicBarWidth', () => {
    it('gives the leader the full width', () => {
        expect(hotTopicBarWidth(12713, 12713)).toBe(100);
    });

    it('scales the rest against the leader', () => {
        expect(hotTopicBarWidth(5329, 12713)).toBeCloseTo(41.92, 1);
    });

    it('floors a subject that was barely discussed, so its bar still reads', () => {
        expect(hotTopicBarWidth(1, 12713)).toBe(6);
    });

    it('floors everything when nothing in the list has been transcribed', () => {
        // A freshly released meeting can supply the leader with zero seconds; there
        // is no ratio to draw, and dividing would blow up.
        expect(hotTopicBarWidth(0, 0)).toBe(6);
        expect(hotTopicBarWidth(120, 0)).toBe(6);
    });

    it('never exceeds the leader, even if a caller passes a longer subject', () => {
        expect(hotTopicBarWidth(20000, 12713)).toBe(100);
    });

    it('treats negative seconds as zero', () => {
        expect(hotTopicBarWidth(-5, 12713)).toBe(6);
    });
});
