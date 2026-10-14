import { CARD_HEIGHT, CARD_WIDTH, CARDS_PER_SHEET, CUTS, SHEET_HEIGHT, SHEET_WIDTH, cardFrame, namePieces, toSheets } from '../qrSheetLayout';

const mm = (pt: number) => (pt * 25.4) / 72;

describe('qrSheetLayout', () => {
    it('cuts an A4 page into six cards of 105 × 99 mm', () => {
        expect(CARDS_PER_SHEET).toBe(6);
        expect(mm(CARD_WIDTH)).toBeCloseTo(105, 0);
        expect(mm(CARD_HEIGHT)).toBeCloseTo(99, 0);
    });

    it('tiles the page with no gap and no overlap', () => {
        const frames = Array.from({ length: CARDS_PER_SHEET }, (_, slot) => cardFrame(slot));
        expect(frames.map(f => [f.left, f.top])).toEqual([
            [0, 0], [CARD_WIDTH, 0],
            [0, CARD_HEIGHT], [CARD_WIDTH, CARD_HEIGHT],
            [0, 2 * CARD_HEIGHT], [CARD_WIDTH, 2 * CARD_HEIGHT],
        ]);
        const area = frames.reduce((sum, f) => sum + f.width * f.height, 0);
        expect(area).toBeCloseTo(SHEET_WIDTH * SHEET_HEIGHT, 6);
    });

    // A stack of sheets is cut once through: the cuts must be the card edges.
    it('puts the three cuts on the inner card edges', () => {
        expect(CUTS.vertical).toEqual([cardFrame(1).left]);
        expect(CUTS.horizontal).toEqual([cardFrame(2).top, cardFrame(4).top]);
    });

    it('fills sheets six at a time, the last one with what is left', () => {
        const people = Array.from({ length: 14 }, (_, i) => i);
        expect(toSheets(people).map(sheet => sheet.length)).toEqual([6, 6, 2]);
        expect(toSheets(people).flat()).toEqual(people);
        expect(toSheets([])).toEqual([]);
    });
});

describe('namePieces', () => {
    it('lets a compound surname wrap after its hyphen, keeping the hyphen once', () => {
        expect(namePieces('Σοφία Ελευθεριάδου-Παπαδάκη')).toEqual([
            { text: 'Σοφία', spaceAfter: true },
            { text: 'Ελευθεριάδου-', spaceAfter: false },
            { text: 'Παπαδάκη', spaceAfter: false },
        ]);
    });

    it('wraps a plain name at its spaces, and reads back as the name', () => {
        const pieces = namePieces('Αντώνιος-Ιωάννης  Βαρδάκης ');
        expect(pieces.map(p => p.text + (p.spaceAfter ? ' ' : '')).join('')).toBe('Αντώνιος-Ιωάννης Βαρδάκης');
    });
});
