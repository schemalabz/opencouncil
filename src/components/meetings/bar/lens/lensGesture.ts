import { LENS_MARGIN, LENS_SPAN_SECONDS, lensLeft, lensWindowStart, slideFine, timeAt } from '@/lib/utils/barTimeline';

/**
 * The strip's pointer model as a pure reducer, so the two input paths can be
 * tested without a DOM.
 *
 * A mouse hovers: the lens follows the pointer along the strip (`following`),
 * freezes when the pointer moves up into it (`pinned`), and a click inside it
 * seeks precisely. A finger scrubs: the lens follows the finger along the
 * strip (`coarse`), and once the finger slides up over the lens the drag turns
 * fine (`fine`) — horizontal movement maps to lens pixels, and the window
 * slides only when the marker reaches an edge. Lifting the finger seeks.
 */
export type LensPhase = 'closed' | 'following' | 'pinned' | 'coarse' | 'fine';

export type LensInput = 'mouse' | 'touch';

export interface LensState {
    phase: LensPhase;
    /** The time under the pointer, or the fine drag's time. */
    time: number;
    windowStart: number;
    /** The lens's left edge in strip coordinates. */
    lensLeft: number;
    /** Touch: the finger's last x while the drag is fine, so each move is a delta. */
    fineX: number | null;
}

/** What the reducer needs to know about the strip and the viewport; read once per frame by the hook. */
export interface LensContext {
    duration: number;
    lensEnabled: boolean;
    lensWidth: number;
    stripLeft: number;
    stripWidth: number;
    viewportWidth: number;
}

/** Where a touch has moved to, judged by the hook from the finger's y with hysteresis. */
export type TouchRegion = 'strip' | 'lens' | 'same';

export type LensEvent =
    | { type: 'stripMove'; x: number }
    | { type: 'stripLeave'; intoLens: boolean }
    | { type: 'lensMove'; fraction: number }
    | { type: 'lensLeave'; intoStrip: boolean }
    | { type: 'stripClick'; x: number }
    | { type: 'lensClick'; fraction: number }
    | { type: 'down'; x: number }
    | { type: 'touchMove'; x: number; clientX: number; region: TouchRegion }
    | { type: 'up' }
    | { type: 'cancel' };

/** A strip click lands within a minute or so; a click inside the lens, within a second. */
export type SeekPrecision = 'coarse' | 'fine';

export type LensEffect =
    | { type: 'seek'; time: number; precision: SeekPrecision }
    | { type: 'suppressClick' };

export const CLOSED: LensState = { phase: 'closed', time: 0, windowStart: 0, lensLeft: 0, fineX: null };

/** The width moves in these steps, so a live resize does not rebuild the track per pixel. */
const LENS_WIDTH_STEP = 8;

/**
 * How wide the lens is: about 15x the strip on a desktop, capped so ten
 * minutes never sprawl; on a phone the dock's width less a margin, so the
 * names inside stay legible even though it overhangs the play button.
 */
export function lensWidthFor(barWidth: number, viewportWidth: number, compact: boolean, margin = LENS_MARGIN): number {
    const width = compact ? Math.max(200, Math.min(viewportWidth - margin * 2, 400)) : Math.min(Math.max(barWidth * 0.6, 360), 720);
    return Math.floor(width / LENS_WIDTH_STEP) * LENS_WIDTH_STEP;
}

/** The lens placed for a pointer at strip x, its window centred on the time there. */
function follow(state: LensState, phase: LensPhase, x: number, ctx: LensContext): LensState {
    const time = timeAt(x, ctx.stripWidth, ctx.duration);
    return {
        ...state,
        phase,
        time,
        windowStart: lensWindowStart(time, ctx.duration),
        lensLeft: lensLeft(x, ctx.lensWidth, ctx.stripLeft, ctx.viewportWidth),
        fineX: null,
    };
}

export function lensReducer(state: LensState, event: LensEvent, ctx: LensContext): { state: LensState; effects: LensEffect[] } {
    const none: LensEffect[] = [];
    // Without a duration there is nothing to map a pointer onto: no phase
    // opens and no seek fires, and a phase already open folds shut.
    if (ctx.duration <= 0) {
        return { state: state.phase === 'closed' ? state : { ...state, phase: 'closed', fineX: null }, effects: none };
    }
    switch (event.type) {
        case 'stripMove': {
            if (state.phase === 'coarse' || state.phase === 'fine') return { state, effects: none };
            if (!ctx.lensEnabled) return { state: { ...state, phase: 'closed', time: timeAt(event.x, ctx.stripWidth, ctx.duration) }, effects: none };
            return { state: follow(state, 'following', event.x, ctx), effects: none };
        }
        case 'stripLeave': {
            if (state.phase !== 'following') return { state, effects: none };
            return { state: { ...state, phase: event.intoLens ? 'pinned' : 'closed' }, effects: none };
        }
        case 'lensMove': {
            if (state.phase !== 'following' && state.phase !== 'pinned') return { state, effects: none };
            const time = state.windowStart + Math.min(Math.max(event.fraction, 0), 1) * LENS_SPAN_SECONDS;
            return { state: { ...state, phase: 'pinned', time: Math.min(time, ctx.duration) }, effects: none };
        }
        case 'lensLeave': {
            if (state.phase !== 'pinned') return { state, effects: none };
            return { state: { ...state, phase: event.intoStrip ? 'following' : 'closed' }, effects: none };
        }
        case 'stripClick':
            return { state, effects: [{ type: 'seek', time: timeAt(event.x, ctx.stripWidth, ctx.duration), precision: 'coarse' }] };
        case 'lensClick': {
            if (state.phase !== 'pinned') return { state, effects: none };
            const time = Math.min(state.windowStart + Math.min(Math.max(event.fraction, 0), 1) * LENS_SPAN_SECONDS, ctx.duration);
            return { state: { ...state, time }, effects: [{ type: 'seek', time, precision: 'fine' }] };
        }
        case 'down':
            return { state: follow(state, 'coarse', event.x, ctx), effects: none };
        case 'touchMove': {
            if (state.phase === 'coarse') {
                if (event.region === 'lens' && ctx.lensEnabled) {
                    return { state: { ...state, phase: 'fine', fineX: event.clientX }, effects: none };
                }
                return { state: follow(state, 'coarse', event.x, ctx), effects: none };
            }
            if (state.phase === 'fine') {
                if (event.region === 'strip') return { state: follow(state, 'coarse', event.x, ctx), effects: none };
                const delta = ((event.clientX - (state.fineX ?? event.clientX)) * LENS_SPAN_SECONDS) / ctx.lensWidth;
                const slid = slideFine(state.time + delta, state.windowStart, ctx.duration);
                return { state: { ...state, ...slid, fineX: event.clientX }, effects: none };
            }
            return { state, effects: none };
        }
        case 'up': {
            if (state.phase !== 'coarse' && state.phase !== 'fine') return { state, effects: none };
            const precision = state.phase === 'fine' ? 'fine' : 'coarse';
            return {
                state: { ...state, phase: 'closed', fineX: null },
                effects: [{ type: 'seek', time: state.time, precision }, { type: 'suppressClick' }],
            };
        }
        case 'cancel':
            return { state: { ...state, phase: 'closed', fineX: null }, effects: none };
    }
}
