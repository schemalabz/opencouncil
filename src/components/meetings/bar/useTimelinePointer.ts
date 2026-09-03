"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { bandAt, LENS_MIN_DURATION_SECONDS, type BarBand } from '@/lib/utils/barTimeline';
import { formatTimestamp } from '@/lib/utils';
import { CLOSED, lensReducer, lensWidthFor, type LensContext, type LensEvent, type LensInput, type LensState, type TouchRegion } from './lens/lensGesture';

/** What the lens repaints on a frame; the window is frozen while the pointer is inside it. */
export interface LensFrame {
    left: number;
    windowStart: number;
    time: number;
    windowFrozen: boolean;
}

export interface LensHandle {
    paint(frame: LensFrame): void;
}

export type SeekPrecision = 'coarse' | 'fine';

interface TimelinePointerOptions {
    barRef: React.RefObject<HTMLDivElement | null>;
    bands: BarBand[];
    duration: number;
    compact: boolean;
    /** The strip's measured width, so the lens can size itself when it opens. */
    barWidth: number;
    /** Whether the lens may open at all; the duration gate applies on top. */
    lensAllowed: boolean;
    onSeek: (time: number, precision: SeekPrecision, input: LensInput) => void;
}

/** A finger this far above the strip is in the lens; this far below, back on the strip. Hysteresis between. */
const FINE_ENTER_PX = 12;
const FINE_LEAVE_PX = 8;
/** The plain tooltip's width and half-width, for its clamp. */
const TOOLTIP_WIDTH = 220;

/**
 * The strip's pointer: one rAF per burst, DOM writes by transform, React
 * state only when something the tree shows changes — the hovered band, the
 * lens opening or closing, a drag turning fine.
 *
 * The phases live in `lensReducer`. This hook turns pointer events into its
 * events (reading the strip's rect once per frame), performs its effects, and
 * paints the cursor line, the tooltip or the lens from the state it returns.
 */
export function useTimelinePointer({ barRef, bands, duration, compact, barWidth, lensAllowed, onSeek }: TimelinePointerOptions) {
    const lensEnabled = lensAllowed && duration >= LENS_MIN_DURATION_SECONDS;

    const cursorRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const lensRef = useRef<LensHandle>(null);
    const lensElRef = useRef<HTMLDivElement>(null);

    const state = useRef<LensState>(CLOSED);
    const input = useRef<LensInput>('mouse');
    const latest = useRef<{ kind: 'strip' | 'lens'; clientX: number; clientY: number } | null>(null);
    const rafId = useRef<number | null>(null);
    const scrubRect = useRef<DOMRect | null>(null);
    const suppressClick = useRef(false);
    const hoverBandRef = useRef(-1);
    const lensWidthRef = useRef(0);

    const [hovering, setHovering] = useState(false);
    const [lensOpen, setLensOpen] = useState(false);
    const [fine, setFine] = useState(false);
    const [hoverBand, setHoverBand] = useState(-1);
    const [lensWidth, setLensWidth] = useState(0);

    // Sized when it opens and whenever the strip resizes underneath it.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const width = lensWidthFor(barWidth, window.innerWidth, compact);
        lensWidthRef.current = width;
        setLensWidth(width);
    }, [barWidth, compact]);

    const context = useCallback((rect: DOMRect): LensContext => ({
        duration,
        lensEnabled,
        lensWidth: lensWidthRef.current,
        stripLeft: rect.left,
        stripWidth: rect.width,
        viewportWidth: window.innerWidth,
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
            lensRef.current?.paint({
                left: current.lensLeft,
                windowStart: current.windowStart,
                time: current.time,
                windowFrozen: current.phase === 'pinned' || current.phase === 'fine',
            });
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
            if (effect.type === 'seek') onSeek(effect.time, effect.precision, input.current);
            else suppressClick.current = true;
        }
        const wasOpen = before.phase !== 'closed';
        const isOpen = after.phase !== 'closed';
        if (wasOpen !== isOpen) setLensOpen(isOpen);
        const isFine = after.phase === 'fine';
        if ((before.phase === 'fine') !== isFine) setFine(isFine);
        // Below the gate a mouse hover never opens a phase, but the cursor line
        // and the tooltip still follow it.
        const hoverBelowGate = !lensEnabled && event.type === 'stripMove';
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
            const top = (scrubRect.current ?? rect).top;
            const region: TouchRegion = pending.clientY < top - FINE_ENTER_PX ? 'lens' : pending.clientY > top + FINE_LEAVE_PX ? 'strip' : 'same';
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
        const el = barRef.current;
        if (state.current.phase === 'following' || state.current.phase === 'pinned') {
            state.current = { ...state.current, phase: 'closed' };
            setLensOpen(false);
            if (el && cursorRef.current) cursorRef.current.style.opacity = '0';
        }
    }, [lensEnabled, barRef]);

    const rectOf = () => barRef.current?.getBoundingClientRect() ?? null;

    const strip = {
        onPointerMove: (e: React.PointerEvent) => {
            input.current = e.pointerType === 'mouse' ? 'mouse' : 'touch';
            latest.current = { kind: 'strip', clientX: e.clientX, clientY: e.clientY };
            setHovering(true);
            schedule();
        },
        onPointerLeave: (e: React.PointerEvent) => {
            if (e.pointerType !== 'mouse') return;
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
            scrubRect.current = rect;
            setHovering(true);
            dispatch({ type: 'down', x: e.clientX - rect.left }, rect);
        },
        onPointerUp: (e: React.PointerEvent) => {
            if (e.pointerType === 'mouse') return;
            // The last move may still be waiting for its frame: land it first,
            // so the seek is where the finger lifted.
            if (rafId.current !== null) {
                cancelAnimationFrame(rafId.current);
                flush();
            }
            const rect = rectOf();
            if (rect) dispatch({ type: 'up' }, rect);
            setHovering(false);
            latest.current = null;
        },
        onPointerCancel: (e: React.PointerEvent) => {
            if (e.pointerType === 'mouse') return;
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
        onPointerMove: (e: React.PointerEvent) => {
            if (e.pointerType !== 'mouse') return;
            latest.current = { kind: 'lens', clientX: e.clientX, clientY: e.clientY };
            schedule();
        },
        onPointerLeave: (e: React.PointerEvent) => {
            if (e.pointerType !== 'mouse') return;
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

    return { lensEnabled, hovering, lensOpen, fine, hoverBand, lensWidth, cursorRef, tooltipRef, lensRef, lensElRef, strip, lens };
}
