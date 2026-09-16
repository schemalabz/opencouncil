import type { BarMode } from './ModePicker';

/**
 * The mode name over the bands. `hold` while a mouse rests on the picker's
 * other cell: the strip wears that mode's colours and names it, until the
 * mouse leaves. `play` after a switch: the name fades in, stays, fades out.
 * `release` after a switch made from the hover: the name is already up, so it
 * only stays and fades out. The key remounts the overlay, so a run restarts.
 */
export interface ModeAnnounce {
    mode: BarMode;
    key: number;
    phase: 'hold' | 'play' | 'release';
}

/** The picker was clicked. */
export function announceSwitch(previous: ModeAnnounce | null, mode: BarMode, key: number): ModeAnnounce {
    const fromHover = previous?.phase === 'hold' && previous.mode === mode;
    return { mode, key, phase: fromHover ? 'release' : 'play' };
}

/**
 * A mouse came to rest on the picker's other cell, or left the picker.
 * Leaving takes a held name away and leaves a running one alone.
 */
export function announcePreview(previous: ModeAnnounce | null, mode: BarMode | null, key: number): ModeAnnounce | null {
    if (mode) return { mode, key, phase: 'hold' };
    return previous?.phase === 'hold' ? null : previous;
}
