import type { AdministrativeBodyType } from '@prisma/client';

/**
 * Geometry for the city overview's meeting timeline (Greek realm).
 *
 * The two-sided layout — committees left, council right, one date spine down the
 * middle — cannot be flowed: each column must advance independently, or a tall
 * council card pushes the next committee date down by its own height and leaves
 * half the module blank. So the cards are absolutely positioned, and everything
 * inside a card has a fixed height (one-line titles, fixed chip rows) precisely
 * so that these constants are exact rather than estimates.
 */
export const TL = {
    /** Minimum vertical distance between two date nodes on the spine. */
    NODE_GAP: 46,
    /** Minimum gap between two cards stacked in the same column. */
    CARD_GAP: 16,
    /** The date pill's height. */
    NODE_H: 30,
    /** Where a card's connector tick sits below its top — the pill's midline. */
    TICK_Y: 15,
    /** Card border (2) + padding (12 top, 10 bottom) + header row (30). */
    CARD_CHROME: 54,
    /** One subject row: rule + padding + a one-line title + the chip line. */
    ROW_H: 59,
    /** The "και άλλα N θέματα" line. */
    FOOTER_H: 30,
    /** The line shown when a meeting has no subjects to preview. */
    EMPTY_H: 38,
    /** How many subjects a card previews — the same cap the meeting cards use. */
    PREVIEW_ROWS: 3,
} as const;

export type TimelineSide = 'left' | 'right';

/**
 * Which side of the spine a meeting belongs to: the council right, everything
 * else — committees, communities — left. A meeting with no administrative body
 * (cities imported before bodies existed) reads as the council's, which is the
 * default body everywhere else in the app.
 */
export function timelineSide(type: AdministrativeBodyType | null | undefined): TimelineSide {
    return type == null || type === 'council' ? 'right' : 'left';
}

/** A card's exact height for a meeting previewing `subjectCount` subjects. */
export function timelineCardHeight(subjectCount: number): number {
    const rows = Math.min(subjectCount, TL.PREVIEW_ROWS);
    const tail = subjectCount === 0 ? TL.EMPTY_H : subjectCount > TL.PREVIEW_ROWS ? TL.FOOTER_H : 0;
    return TL.CARD_CHROME + rows * TL.ROW_H + tail;
}

export interface TimelinePlacement {
    top: number;
    height: number;
}

/**
 * Place the cards. Entries arrive in display order (newest first); each column
 * flows on its own, and a date node only has to clear the node before it — so
 * where sides alternate, the nodes sit NODE_GAP apart instead of a whole card
 * apart, which is the entire point of the two-sided layout.
 */
export function packTimeline(
    entries: ReadonlyArray<{ side: TimelineSide; height: number }>,
): { placements: TimelinePlacement[]; height: number } {
    let yLeft = 0;
    let yRight = 0;
    let lastNode = -Infinity;
    const placements: TimelinePlacement[] = [];

    for (const entry of entries) {
        const columnY = entry.side === 'right' ? yRight : yLeft;
        const top = Math.max(columnY, lastNode + TL.NODE_GAP, 0);
        placements.push({ top, height: entry.height });
        lastNode = top;
        if (entry.side === 'right') yRight = top + entry.height + TL.CARD_GAP;
        else yLeft = top + entry.height + TL.CARD_GAP;
    }

    const height = placements.reduce(
        (max, p) => Math.max(max, p.top + p.height),
        placements.length ? placements[placements.length - 1].top + TL.NODE_H : 0,
    );
    return { placements, height };
}
