/**
 * Where the sign-up cards sit on a sheet: an A4 page cut into a grid of two
 * columns and three rows, so each card is a sixth of the page (105 × 99 mm).
 *
 * Every page puts its cards in the same places, so a stack of pages is cut
 * with three cuts: one vertical, two horizontal. The page edges are the card
 * edges, so the outside needs no cut.
 *
 * Plain numbers, kept out of the PDF component so a test can pin them without
 * loading the renderer.
 */

/** A4 in PDF points, as @react-pdf/renderer measures it. */
export const SHEET_WIDTH = 595.28;
export const SHEET_HEIGHT = 841.89;
export const SHEET_COLUMNS = 2;
export const SHEET_ROWS = 3;
export const CARDS_PER_SHEET = SHEET_COLUMNS * SHEET_ROWS;

export const CARD_WIDTH = SHEET_WIDTH / SHEET_COLUMNS;
export const CARD_HEIGHT = SHEET_HEIGHT / SHEET_ROWS;

export interface CardFrame {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** The frame of the card in `slot` (0–5), reading left to right, then down. */
export function cardFrame(slot: number): CardFrame {
    const column = slot % SHEET_COLUMNS;
    const row = Math.floor(slot / SHEET_COLUMNS);
    return { left: column * CARD_WIDTH, top: row * CARD_HEIGHT, width: CARD_WIDTH, height: CARD_HEIGHT };
}

/** The cards in sheet order, six to a sheet. The last sheet may hold fewer. */
export function toSheets<T>(cards: readonly T[]): T[][] {
    const sheets: T[][] = [];
    for (let i = 0; i < cards.length; i += CARDS_PER_SHEET) {
        sheets.push(cards.slice(i, i + CARDS_PER_SHEET));
    }
    return sheets;
}

/** Where the three cuts fall, in points: the inner edges of the grid. */
export const CUTS = {
    vertical: [CARD_WIDTH],
    horizontal: [CARD_HEIGHT, 2 * CARD_HEIGHT],
};

/** A piece of a name that wraps whole, and whether a space follows it. */
export interface NamePiece {
    text: string;
    spaceAfter: boolean;
}

/**
 * A name cut into the pieces it may wrap between: at spaces, and after each
 * hyphen of a compound name ("Ελευθεριάδου-Παπαδάκη"). react-pdf breaks a
 * line only at a space, and at a hyphenation point it adds a hyphen of its
 * own, so a compound name either ran past the card or printed with two
 * hyphens. Laid out as a wrapping row, a piece that does not fit moves to the
 * next line as it is.
 */
export function namePieces(name: string): NamePiece[] {
    const words = name.trim().split(/\s+/).filter(Boolean);
    return words.flatMap((word, w) => {
        const parts = word.split(/(?<=-)/);
        return parts.map((text, p) => ({ text, spaceAfter: p === parts.length - 1 && w < words.length - 1 }));
    });
}
