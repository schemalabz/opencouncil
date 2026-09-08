import { packTimeline, timelineCardHeight, timelineSide, TL } from '../meetingsTimeline';
import { SUBJECT_PREVIEW_COUNT } from '../subjects';

describe('TL.PREVIEW_ROWS', () => {
    it('previews as many subjects as a meeting card does', () => {
        // The timeline's card geometry is exact, so a card that previews more rows
        // than the constant says overlaps the card below it.
        expect(TL.PREVIEW_ROWS).toBe(SUBJECT_PREVIEW_COUNT);
    });
});

describe('timelineSide', () => {
    it('puts the council right, committees left, and communities nowhere', () => {
        expect(timelineSide('council')).toBe('right');
        expect(timelineSide('committee')).toBe('left');
        expect(timelineSide('community')).toBeNull();
    });

    it('treats a body-less meeting as the council', () => {
        expect(timelineSide(null)).toBe('right');
        expect(timelineSide(undefined)).toBe('right');
    });
});

describe('timelineCardHeight', () => {
    it('grows by one row per previewed subject, capped at the preview count', () => {
        expect(timelineCardHeight(1)).toBe(TL.CARD_CHROME + TL.ROW_H);
        expect(timelineCardHeight(3)).toBe(TL.CARD_CHROME + 3 * TL.ROW_H);
        // Past the cap, the extra subjects become one footer line, not more rows.
        expect(timelineCardHeight(59)).toBe(TL.CARD_CHROME + 3 * TL.ROW_H + TL.FOOTER_H);
    });

    it('gives an empty meeting its no-agenda line', () => {
        expect(timelineCardHeight(0)).toBe(TL.CARD_CHROME + TL.EMPTY_H);
    });
});

describe('packTimeline', () => {
    const entry = (side: 'left' | 'right', subjects: number) => ({
        side,
        height: timelineCardHeight(subjects),
    });

    it('packs alternating sides a node-gap apart, not a card apart', () => {
        const { placements } = packTimeline([entry('right', 5), entry('left', 2)]);
        expect(placements[0].top).toBe(0);
        // The left card starts beside the tall right card, not below it.
        expect(placements[1].top).toBe(TL.NODE_GAP);
    });

    it('stacks same-side cards below one another', () => {
        const { placements } = packTimeline([entry('left', 2), entry('left', 2)]);
        expect(placements[1].top).toBe(placements[0].top + placements[0].height + TL.CARD_GAP);
    });

    it('never overlaps cards in a column and never reorders nodes', () => {
        const sides: Array<'left' | 'right'> = ['right', 'left', 'left', 'right', 'left', 'right', 'right'];
        const { placements } = packTimeline(sides.map((s, i) => entry(s, i % 5)));

        let lastNode = -Infinity;
        const bottoms = { left: -Infinity, right: -Infinity };
        placements.forEach((p, i) => {
            // Nodes descend in input (chronological) order, at least NODE_GAP apart.
            expect(p.top).toBeGreaterThanOrEqual(lastNode + TL.NODE_GAP);
            lastNode = p.top;
            // A card clears the previous card in its own column.
            expect(p.top).toBeGreaterThanOrEqual(bottoms[sides[i]] + (bottoms[sides[i]] === -Infinity ? 0 : TL.CARD_GAP));
            bottoms[sides[i]] = p.top + p.height;
        });
    });

    it('degenerates to a plain stack when every meeting is on one side', () => {
        const { placements } = packTimeline([entry('right', 3), entry('right', 1), entry('right', 0)]);
        for (let i = 1; i < placements.length; i++) {
            expect(placements[i].top).toBe(placements[i - 1].top + placements[i - 1].height + TL.CARD_GAP);
        }
    });

    it('reports the height of the tallest column and survives an empty list', () => {
        const { placements, height } = packTimeline([entry('right', 5), entry('left', 1)]);
        expect(height).toBe(Math.max(...placements.map(p => p.top + p.height)));
        expect(packTimeline([])).toEqual({ placements: [], height: 0 });
    });
});
