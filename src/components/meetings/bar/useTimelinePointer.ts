"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { bandAt, LENS_MIN_DURATION_SECONDS, lensLeft, type BarBand } from '@/lib/utils/barTimeline';
import { formatTimestamp } from '@/lib/utils';
import { CLOSED, lensReducer, lensWidthFor, type LensContext, type LensEvent, type LensInput, type LensState, type SeekPrecision, type TouchRegion } from './lens/lensGesture';

/** What the lens repaints on a frame. */
export interface LensFrame {
    left: number;
    windowStart: number;
    time: number;
}

export interface LensHandle {
    paint(frame: LensFrame): void;
}

/** Where a seek came from, for analytics. */
export interface SeekDetail {
    precision: SeekPrecision;
    input: LensInput;
    /** whether the lens was available for this seek */
    lens: boolean;
}

interface TimelinePointerOptions {
    barRef: React.RefObject<HTMLDivElement | null>;
    bands: BarBand[];
    duration: number;
    compact: boolean;
    /** The strip's measured width, so the lens can size itself when it opens. */
    barWidth: number;
    onSeek: (time: number, detail: SeekDetail) => void;
}

/** A finger this far above the strip is in the lens; this far below, back on the strip. Hysteresis between. */
const FINE_ENTER_PX = 12;
const FINE_LEAVE_PX = 8;
/** The plain tooltip's width and half-width, for its clamp. */
const TOOLTIP_WIDTH = 220;

/** The layout viewport; `innerWidth` would count a classic scrollbar. */
const viewportWidth = () => document.documentElement.clientWidth;

/** A pen in the air hovers like a mouse; in contact it scrubs like a finger. */
const inputOf = (e: React.PointerEvent): LensInput => {
    if (e.pointerType === 'mouse') return 'mouse';
    if (e.pointerType === 'touch') return 'touch';
    return e.buttons === 0 ? 'mouse' : 'touch';
};

/**
 * The strip's pointer: one rAF per burst, DOM writes by transform, React
 * state only when something the tree shows changes — the hovered band, the
 * lens opening or closing, a drag turning fine.
 *
 * The phases live in `lensReducer`. This hook turns pointer events into its
 * events (reading the strip's rect once per frame), performs its effects, and
 * paints the cursor line, the tooltip or the lens from the state it returns.
 */
export function useTimelinePointer({ barRef, bands, duration, compact, barWidth, onSeek }: TimelinePointerOptions) {
    // Long enough for the lens to help, with a duration the track can be sized from.
    const lensEnabled = Number.isFinite(duration) && duration >= LENS_MIN_DURATION_SECONDS;

    const cursorRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const lensRef = useRef<LensHandle>(null);
    const lensElRef = useRef<HTMLDivElement>(null);

    const state = useRef<LensState>(CLOSED);
    const input = useRef<LensInput>('mouse');
    const latest = useRef<{ kind: 'strip' | 'lens'; clientX: number; clientY: number } | null>(null);
    const rafId = useRef<number | null>(null);
    const suppressClick = useRef(false);
    const hoverBandRef = useRef(-1);
    const lensWidthRef = useRef(0);

    const [hovering, setHovering] = useState(false);
    const [lensOpen, setLensOpen] = useState(false);
    const [lensMounted, setLensMounted] = useState(false);
    const [coarse, setCoarse] = useState(false);
    const [fine, setFine] = useState(false);
    const [hoverBand, setHoverBand] = useState(-1);
    const [lensWidth, setLensWidth] = useState(0);

    // Sized when it opens and whenever the strip resizes underneath it.
    useEffect(() => {
        const width = lensWidthFor(barWidth, viewportWidth(), compact);
        lensWidthRef.current = width;
        setLensWidth(width);
    }, [barWidth, compact]);

    const context = useCallback((rect: DOMRect): LensContext => ({
        duration,
        lensEnabled,
        lensWidth: lensWidthRef.current,
        stripLeft: rect.left,
        stripWidth: rect.width,
        viewportWidth: viewportWidth(),
    }), [duration, lensEnabled]);

    const paint = useCallback((rect: DOMRect) => {
        const current = state.current;
        const open = current.phase !== 'closed';
        const x = duration > 0 ? (current.time / duration) * rect.width : 0;
        if (cursorRef.current) {
            cursorRef.current.style.transform = `translateX(${x}px)`;
            cursorRef.current.style.opacity = open || !lensEnabled ? '1' : '0';
        }
        if (!lensEnabled && tooltipRef.current) {
            // On a strip narrower than the tooltip the clamp would invert and
            // pin it part-way off; centring is the honest fallback.
            const half = TOOLTIP_WIDTH / 2;
            const clamped = rect.width < TOOLTIP_WIDTH ? rect.width / 2 : Math.min(Math.max(x, half), rect.width - half);
            tooltipRef.current.style.transform = `translateX(${clamped}px) translateX(-50%)`;
            const timeEl = tooltipRef.current.querySelector('[data-bar-time]');
            if (timeEl) timeEl.textContent = formatTimestamp(current.time);
        }
        if (lensEnabled && open) {
            lensRef.current?.paint({ left: current.lensLeft, windowStart: current.windowStart, time: current.time });
        }
        const idx = bandAt(bands, current.time);
        if (idx !== hoverBandRef.current) {
            hoverBandRef.current = idx;
            setHoverBand(idx);
        }
    }, [bands, duration, lensEnabled]);

    const dispatch = useCallback((event: LensEvent, rect: DOMRect) => {
        const before = state.current;
        const { state: after, effects } = lensReducer(before, event, context(rect));
        state.current = after;
        for (const effect of effects) {
            if (effect.type === 'seek') onSeek(effect.time, { precision: effect.precision, input: input.current, lens: lensEnabled });
            else suppressClick.current = true;
        }
        const wasOpen = before.phase !== 'closed';
        const isOpen = after.phase !== 'closed';
        if (wasOpen !== isOpen) {
            setLensOpen(isOpen);
            // The lens mounts on its first opening and stays mounted, hidden, after.
            if (isOpen && lensEnabled) setLensMounted(true);
        }
        const isCoarse = after.phase === 'coarse';
        if ((before.phase === 'coarse') !== isCoarse) setCoarse(isCoarse);
        const isFine = after.phase === 'fine';
        if ((before.phase === 'fine') !== isFine) setFine(isFine);
        // Below the gate a mouse never opens a phase, but the cursor line and
        // the tooltip still follow its moves and clicks.
        const hoverBelowGate = !lensEnabled && (event.type === 'stripMove' || event.type === 'stripClick');
        if (!isOpen && !hoverBelowGate) {
            if (cursorRef.current) cursorRef.current.style.opacity = '0';
            if (hoverBandRef.current !== -1) {
                hoverBandRef.current = -1;
                setHoverBand(-1);
            }
            return;
        }
        paint(rect);
    }, [context, lensEnabled, onSeek, paint]);

    // The frame: read the strip's rect once, then dispatch the latest pointer
    // position as the event its input and phase call for.
    const flush = useCallback(() => {
        rafId.current = null;
        const el = barRef.current;
        const pending = latest.current;
        if (!el || !pending || duration <= 0) return;
        const rect = el.getBoundingClientRect();
        const x = pending.clientX - rect.left;
        if (pending.kind === 'lens') {
            const lensRect = lensElRef.current?.getBoundingClientRect();
            if (!lensRect || lensRect.width <= 0) return;
            dispatch({ type: 'lensMove', fraction: (pending.clientX - lensRect.left) / lensRect.width }, rect);
            return;
        }
        if (input.current === 'touch') {
            const region: TouchRegion = pending.clientY < rect.top - FINE_ENTER_PX ? 'lens' : pending.clientY > rect.top + FINE_LEAVE_PX ? 'strip' : 'same';
            dispatch({ type: 'touchMove', x, clientX: pending.clientX, region }, rect);
            return;
        }
        dispatch({ type: 'stripMove', x }, rect);
    }, [barRef, dispatch, duration]);

    const schedule = useCallback(() => {
        if (rafId.current === null) rafId.current = requestAnimationFrame(flush);
    }, [flush]);

    useEffect(() => () => { if (rafId.current !== null) cancelAnimationFrame(rafId.current); }, []);

    // Below the gate the lens has nothing to show: whatever phase a hover left
    // behind folds back to closed.
    useEffect(() => {
        if (lensEnabled) return;
        if (state.current.phase === 'following' || state.current.phase === 'pinned') {
            state.current = { ...state.current, phase: 'closed' };
            setLensOpen(false);
            if (cursorRef.current) cursorRef.current.style.opacity = '0';
        }
    }, [lensEnabled]);

    // Pointer events alone write the frame, so two moments need a paint of
    // their own: the lens's first mount (its handle did not exist when the
    // opening frame ran) and a width change while it is open, which re-scales
    // the track under the last transforms.
    useEffect(() => {
        if (!lensOpen || !lensEnabled || duration <= 0) return;
        const rect = barRef.current?.getBoundingClientRect();
        const current = state.current;
        if (!rect || current.phase === 'closed') return;
        const x = (current.time / duration) * rect.width;
        state.current = { ...current, lensLeft: lensLeft(x, lensWidth, rect.left, viewportWidth()) };
        paint(rect);
    }, [lensOpen, lensEnabled, lensWidth, duration, paint, barRef]);

    const rectOf = () => barRef.current?.getBoundingClientRect() ?? null;

    // A long press is part of a scrub, not a request for the browser's menu.
    const onContextMenu = (e: React.MouseEvent) => {
        if (input.current === 'touch') e.preventDefault();
    };

    const strip = {
        onContextMenu,
        onPointerMove: (e: React.PointerEvent) => {
            if (!e.isPrimary) return;
            input.current = inputOf(e);
            latest.current = { kind: 'strip', clientX: e.clientX, clientY: e.clientY };
            setHovering(true);
            schedule();
        },
        onPointerLeave: (e: React.PointerEvent) => {
            if (inputOf(e) !== 'mouse') return;
            setHovering(false);
            const rect = rectOf();
            if (!rect) return;
            const intoLens = Boolean(lensElRef.current && e.relatedTarget instanceof Node && lensElRef.current.contains(e.relatedTarget));
            dispatch({ type: 'stripLeave', intoLens }, rect);
            latest.current = null;
        },
        // Touch scrubbing: capture the pointer so the drag belongs to the strip
        // (touch-action-none keeps the browser from claiming it for panning),
        // preview along the way, seek where the finger lifts.
        onPointerDown: (e: React.PointerEvent) => {
            suppressClick.current = false;
            if (e.pointerType === 'mouse' || !e.isPrimary) return;
            const rect = rectOf();
            if (!rect) return;
            input.current = 'touch';
            barRef.current?.setPointerCapture(e.pointerId);
            setHovering(true);
            dispatch({ type: 'down', x: e.clientX - rect.left }, rect);
        },
        onPointerUp: (e: React.PointerEvent) => {
            if (e.pointerType === 'mouse' || !e.isPrimary) return;
            // Land the lift's own position first — it can be a sample past the
            // last move — so the seek is where the finger left the screen.
            if (rafId.current !== null) cancelAnimationFrame(rafId.current);
            latest.current = { kind: 'strip', clientX: e.clientX, clientY: e.clientY };
            flush();
            const rect = rectOf();
            if (rect) dispatch({ type: 'up' }, rect);
            setHovering(false);
            latest.current = null;
        },
        onPointerCancel: (e: React.PointerEvent) => {
            if (e.pointerType === 'mouse' || !e.isPrimary) return;
            const rect = rectOf();
            if (rect) dispatch({ type: 'cancel' }, rect);
            setHovering(false);
            latest.current = null;
        },
        onClick: (e: React.MouseEvent) => {
            // A tap synthesises a click after the pointer already seeked.
            if (suppressClick.current) {
                suppressClick.current = false;
                return;
            }
            const rect = rectOf();
            if (rect) dispatch({ type: 'stripClick', x: e.clientX - rect.left }, rect);
        },
    };

    const lens = {
        onContextMenu,
        // A press starts a new click cycle: a flag armed by an earlier touch
        // (whose click never came) must not eat this one.
        onPointerDown: () => {
            suppressClick.current = false;
        },
        onPointerMove: (e: React.PointerEvent) => {
            if (inputOf(e) !== 'mouse') return;
            latest.current = { kind: 'lens', clientX: e.clientX, clientY: e.clientY };
            schedule();
        },
        onPointerLeave: (e: React.PointerEvent) => {
            if (inputOf(e) !== 'mouse') return;
            const rect = rectOf();
            if (!rect) return;
            const intoStrip = Boolean(barRef.current && e.relatedTarget instanceof Node && barRef.current.contains(e.relatedTarget));
            dispatch({ type: 'lensLeave', intoStrip }, rect);
            if (!intoStrip) latest.current = null;
        },
        onClick: (e: React.MouseEvent) => {
            if (suppressClick.current) {
                suppressClick.current = false;
                return;
            }
            const rect = rectOf();
            const lensRect = lensElRef.current?.getBoundingClientRect();
            if (!rect || !lensRect || lensRect.width <= 0) return;
            dispatch({ type: 'lensClick', fraction: (e.clientX - lensRect.left) / lensRect.width }, rect);
        },
    };

    return { lensEnabled, lensMounted, hovering, lensOpen, coarse, fine, hoverBand, lensWidth, cursorRef, tooltipRef, lensRef, lensElRef, strip, lens };
}
