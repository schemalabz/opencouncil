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
import { INTER_SEMIBOLD_WIDTHS } from './interSemiBoldWidths';

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

/** About 7 mm from every cut; above the 4–5 mm a printer cannot reach. */
export const CARD_PADDING_X = 21;
export const CARD_PADDING_Y = 20;
/** Room for the caption under the QR on one line in every locale. */
export const QR_BOX_WIDTH = 128;
export const QR_NAME_GAP = 12;
/** The column beside the QR that holds the name and the role. */
export const NAME_COLUMN_WIDTH = CARD_WIDTH - 2 * CARD_PADDING_X - QR_BOX_WIDTH - QR_NAME_GAP;

export const NAME_FONT_SIZE = 13;
/** Below this the name is hard to read from a card on a desk. */
export const NAME_MIN_FONT_SIZE = 9;
/** The space between the words of a name, in em. */
export const NAME_WORD_SPACE = 0.27;

/** A piece of a name that wraps whole, and whether a space follows it. */
export interface NamePiece {
    text: string;
    spaceAfter: boolean;
}

/**
 * A name cut into the pieces it may wrap between: at spaces, and after each
 * hyphen or dash of a compound name ("Ελευθεριάδου-Παπαδάκη",
 * "Ελευθεριάδου–Παπαδάκη"). react-pdf breaks a line only at a space, and at
 * a hyphenation point it adds a hyphen of its own, so a compound name either
 * ran past the card or printed with two hyphens. Laid out as a wrapping row,
 * a piece that does not fit moves to the next line as it is.
 */
export function namePieces(name: string): NamePiece[] {
    const words = name.trim().split(/\s+/).filter(Boolean);
    return words.flatMap((word, w) => {
        const parts = word.split(/(?<=[-\u2010\u2013\u2014])/);
        return parts.map((text, p) => ({ text, spaceAfter: p === parts.length - 1 && w < words.length - 1 }));
    });
}

// Wider than every letter in the table except M, W, m and w, so that a
// character the table lacks errs wide.
const FALLBACK_WIDTH = 800;

/** The width of `text` in points at `fontSize`, in the face of the name. */
export function textWidth(text: string, fontSize: number): number {
    let width = 0;
    // NFC, so that a tonos stored as a combining mark counts once, with its letter.
    for (const char of text.normalize('NFC')) {
        width += INTER_SEMIBOLD_WIDTHS[char] ?? FALLBACK_WIDTH;
    }
    return (width / 1000) * fontSize;
}

/** The width a piece takes in the wrapping row, with the space after it. */
function pieceWidth(piece: NamePiece, fontSize: number): number {
    return textWidth(piece.text, fontSize) + (piece.spaceAfter ? NAME_WORD_SPACE * fontSize : 0);
}

/**
 * The size to set a name in so that each of its pieces fits the name column.
 * A piece never breaks, so a single long word shrinks the name instead of
 * running into the next card: "Παπαδημητρόπουλος" is about 138 pt at 13 pt.
 */
export function nameFontSize(pieces: readonly NamePiece[]): number {
    const widest = Math.max(0, ...pieces.map(piece => pieceWidth(piece, NAME_FONT_SIZE)));
    if (widest <= NAME_COLUMN_WIDTH) return NAME_FONT_SIZE;
    const fitted = Math.floor(((NAME_FONT_SIZE * NAME_COLUMN_WIDTH) / widest) * 2) / 2;
    return Math.max(NAME_MIN_FONT_SIZE, fitted);
}
