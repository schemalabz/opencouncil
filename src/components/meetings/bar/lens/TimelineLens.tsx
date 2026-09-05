"use client";

import React, { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useVideo, useVideoActions } from '@/components/meetings/VideoProvider';
import { CHAPTER_LABEL_KEY, LENS_SPAN_SECONDS, rulerLabelStep, type BarBand, type Chapter } from '@/lib/utils/barTimeline';
import { contrastText } from '@/lib/topicStyle';
import { cn, formatTimestamp } from '@/lib/utils';
import { DOCK_ROW, DOCK_ROW_COMPACT, LENS_GAP, LENS_HEIGHT, LENS_HEIGHT_COMPACT } from '../geometry';
import { Playhead } from '../Playhead';
import { HoverBandDetails } from '../HoverBandDetails';
import type { LensFrame, LensHandle } from '../useTimelinePointer';
import type { BarMode } from '../ModePicker';

/** A band narrower than this carries no name. */
const LABEL_MIN_PX = 28;
const HEADER_HEIGHT = 30;
const HEADER_HEIGHT_COMPACT = 26;
const RULER_HEIGHT = 18;
const RULER_HEIGHT_COMPACT = 16;

/** The slide-up hint shows on the first coarse drag of the session and stays away after. */
const HINT_SEEN_KEY = 'oc-lens-hint-seen';

interface TimelineLensProps {
    open: boolean;
    bands: BarBand[];
    chapters: Chapter[];
    mode: BarMode;
    duration: number;
    lensWidth: number;
    compact: boolean;
    /** The band under the lens time, for the header. */
    hovered: BarBand | null;
    /** A finger is dragging fine: the rim says so. */
    fine: boolean;
    /** A touch drag is coarse: the first time in a session, tell the finger it can slide up. */
    hint: boolean;
    /** The positioner's element, so the strip can tell a pointer that left into the lens. */
    elRef: React.RefObject<HTMLDivElement | null>;
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerLeave: (e: React.PointerEvent) => void;
    onClick: (e: React.MouseEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
}

/**
 * Ten minutes of the strip, magnified above it.
 *
 * The whole meeting is painted once at lens scale as one long track and the
 * viewport shows a window of it; a frame moves the positioner, the track and
 * the marker by transform and rewrites the time, so tracking the pointer never
 * re-renders anything. The track is moved with a plain 2D translate and no
 * `will-change` on purpose: promoted, a 10 000px layer costs more than
 * repainting the clipped window each frame.
 */
export const TimelineLens = forwardRef<LensHandle, TimelineLensProps>(function TimelineLens(
    { open, bands, chapters, mode, duration, lensWidth, compact, hovered, fine, hint, elRef, onPointerDown, onPointerMove, onPointerLeave, onClick, onContextMenu },
    ref,
) {
    const t = useTranslations('transcript.controls');
    const trackRef = useRef<HTMLDivElement>(null);
    const markerRef = useRef<HTMLDivElement>(null);
    const timeRef = useRef<HTMLSpanElement>(null);

    // Shown through the first coarse drag of the session; marked seen when
    // that drag ends or turns fine, so it never nags a finger that knows.
    const [showHint, setShowHint] = useState(false);
    const hintShowing = useRef(false);
    useEffect(() => {
        if (hint && !hintShowing.current) {
            let seen = false;
            try { seen = sessionStorage.getItem(HINT_SEEN_KEY) === '1'; } catch { /* storage may be unavailable */ }
            if (seen) return;
            hintShowing.current = true;
            setShowHint(true);
        } else if (!hint && hintShowing.current) {
            hintShowing.current = false;
            try { sessionStorage.setItem(HINT_SEEN_KEY, '1'); } catch { /* ignore */ }
            setShowHint(false);
        }
    }, [hint]);

    useImperativeHandle(ref, () => ({
        paint({ left, windowStart, time }: LensFrame) {
            const pxPerSecond = lensWidth / LENS_SPAN_SECONDS;
            if (elRef.current) elRef.current.style.transform = `translateX(${left}px)`;
            if (trackRef.current) trackRef.current.style.transform = `translateX(${-windowStart * pxPerSecond}px)`;
            if (markerRef.current) markerRef.current.style.transform = `translateX(${(time - windowStart) * pxPerSecond}px)`;
            if (timeRef.current) timeRef.current.textContent = formatTimestamp(time);
        },
    }), [elRef, lensWidth]);

    const height = compact ? LENS_HEIGHT_COMPACT : LENS_HEIGHT;
    const headerHeight = compact ? HEADER_HEIGHT_COMPACT : HEADER_HEIGHT;
    const rulerHeight = compact ? RULER_HEIGHT_COMPACT : RULER_HEIGHT;
    const viewportHeight = height - headerHeight - 4;

    return (
        <div
            ref={elRef}
            aria-hidden
            data-timeline-lens
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
            onClick={onClick}
            onContextMenu={onContextMenu}
            className={cn('absolute left-0 z-40 cursor-crosshair touch-none', open ? 'block' : 'hidden')}
            style={{ bottom: compact ? DOCK_ROW_COMPACT : DOCK_ROW, width: lensWidth, paddingBottom: LENS_GAP }}
        >
            {/* The animation runs on this box and the frame's translate on the
                positioner above it: one element cannot carry both transforms.
                Glass reads as glass only when the page shows through it: a
                light tint over a strong blur, a bright rim, a sheen down from
                the top, and edges that fade like a magnifier's.
                The blur stays in the classes. An SVG `url(#...)` in
                `backdrop-filter` would bend the backdrop at the rim, but no
                engine paints one: Chromium drops the whole declaration when it
                finds a reference filter, so the blur went with it. Do not
                gate that on `CSS.supports`, which checks the syntax alone and
                answers true. */}
            <div
                data-fine={fine ? '' : undefined}
                className={cn(
                    'relative origin-bottom overflow-hidden rounded-[10px] border-2 border-white/80 ring-1 ring-border/70',
                    'bg-card/85 supports-[backdrop-filter]:bg-white/30 supports-[backdrop-filter]:backdrop-saturate-[1.4]',
                    compact ? 'supports-[backdrop-filter]:backdrop-blur-md' : 'supports-[backdrop-filter]:backdrop-blur-lg',
                    'shadow-[0_18px_40px_-12px_rgba(0,0,0,0.35),0_2px_6px_-2px_rgba(0,0,0,0.15),inset_0_1px_0_0_rgba(255,255,255,0.95),inset_0_-1px_0_0_rgba(255,255,255,0.35)]',
                    'motion-safe:animate-[bar-lens-in_200ms_cubic-bezier(0.34,1.56,0.64,1)_both]',
                    'data-[fine]:border-[hsl(var(--orange-deep))]',
                )}
                style={{ height }}
            >
                <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/60 via-white/15 to-white/5" />
                <div className="relative flex items-center gap-2.5 px-3" style={{ height: headerHeight }}>
                    <span ref={timeRef} className={cn('shrink-0 font-black tabular-nums tracking-tight', compact ? 'text-[13px]' : 'text-[15px]')} />
                    {hovered && <span className="h-3.5 w-px shrink-0 bg-border" aria-hidden />}
                    <HoverBandDetails band={hovered} inline />
                </div>
                <div
                    className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_4%,black_96%,transparent)]"
                    style={{ height: viewportHeight }}
                >
                    <LensTrack ref={trackRef} open={open} bands={bands} chapters={chapters} mode={mode} duration={duration} lensWidth={lensWidth} rulerHeight={rulerHeight} />
                    {/* The frame writes this element's transform, so the centring translate sits on the child. */}
                    <div ref={markerRef} className="pointer-events-none absolute inset-y-0 left-0" style={{ zIndex: 3 }}>
                        <div className="h-full w-[2px] -translate-x-1/2 bg-[hsl(var(--orange-deep))]" />
                    </div>
                    {showHint && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center" style={{ zIndex: 4 }}>
                            <span className="rounded-full bg-foreground/85 px-2.5 py-1 text-[10px] font-bold text-background">{t('lensFineHint')}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

/**
 * The meeting at lens scale: one div per band with its name where it fits,
 * a tick per minute with a label at the cadence the width allows, and the
 * chapter boundaries. Paints once per mode and width; the frame only
 * translates it, and the clock's ticks reach the playhead leaf alone.
 */
const LensTrack = memo(forwardRef<HTMLDivElement, {
    open: boolean;
    bands: BarBand[];
    chapters: Chapter[];
    mode: BarMode;
    duration: number;
    lensWidth: number;
    rulerHeight: number;
}>(function LensTrack({ open, bands, chapters, mode, duration, lensWidth, rulerHeight }, ref) {
    const t = useTranslations('transcript.controls');
    if (!Number.isFinite(duration) || duration <= 0 || lensWidth <= 0) return null;
    const pxPerSecond = lensWidth / LENS_SPAN_SECONDS;
    const pxPerMinute = 60 * pxPerSecond;
    const trackWidth = duration * pxPerSecond;
    const labelStep = rulerLabelStep(lensWidth);
    const labels = Array.from({ length: Math.floor(duration / labelStep) + 1 }, (_, i) => i * labelStep);
    return (
        <div ref={ref} className="absolute left-0 top-0 h-full" style={{ width: trackWidth }}>
            <div className="absolute inset-x-0 top-0 border-b border-border/60" style={{ height: rulerHeight }}>
                {/* The minute ticks are one repeating gradient, not a node per minute. */}
                <div
                    className="absolute inset-x-0 bottom-0 h-1"
                    style={{ backgroundImage: `repeating-linear-gradient(to right, hsl(var(--muted-foreground) / 0.5) 0 1px, transparent 1px ${pxPerMinute}px)` }}
                />
                {labels.map(time => (
                    <div key={time} className="absolute inset-y-0" style={{ left: time * pxPerSecond }}>
                        <div className="absolute bottom-0 h-2 w-px bg-muted-foreground/50" />
                        <span className="absolute left-1.5 top-[3px] whitespace-nowrap text-[9px] font-bold leading-none tabular-nums text-muted-foreground">
                            {formatTimestamp(time)}
                        </span>
                    </div>
                ))}
            </div>
            {chapters.map(chapter => chapter.start > 0 && (
                <div key={chapter.key} className="absolute inset-y-0 border-l border-dashed border-muted-foreground/60" style={{ left: `${(chapter.start / duration) * 100}%`, zIndex: 2 }}>
                    <span className="absolute left-1 top-0.5 whitespace-nowrap text-[8px] font-bold tracking-[0.07em] text-muted-foreground">
                        {t(CHAPTER_LABEL_KEY[chapter.key])}
                    </span>
                </div>
            ))}
            <div className="absolute inset-x-0 bottom-0" style={{ top: rulerHeight + 6 }}>
                {bands.map((band, i) => {
                    const color = mode === 'speakers' ? band.speakerColor : band.subjectColor;
                    const label = mode === 'speakers' ? band.speakerName : band.subjectName;
                    const wide = (band.end - band.start) * pxPerSecond >= LABEL_MIN_PX;
                    return (
                        <div
                            key={i}
                            className="absolute inset-y-1.5 overflow-hidden rounded-[6px]"
                            style={{
                                left: `${(band.start / duration) * 100}%`,
                                width: `${((band.end - band.start) / duration) * 100}%`,
                                backgroundColor: color,
                            }}
                        >
                            {wide && label && (
                                <span className="block truncate px-2 pt-1.5 text-[10px] font-bold leading-tight" style={{ color: contrastText(color) }}>
                                    {label}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
            <LensPlayhead trackRef={ref as React.RefObject<HTMLDivElement | null>} duration={duration} active={open} />
        </div>
    );
}), (prev, next) =>
    prev.open === next.open &&
    prev.bands === next.bands &&
    prev.chapters === next.chapters &&
    prev.mode === next.mode &&
    prev.duration === next.duration &&
    prev.lensWidth === next.lensWidth &&
    prev.rulerHeight === next.rulerHeight
);

/**
 * The lens's own playhead. It alone subscribes to the video context, so the
 * clock's ticks re-render this leaf and not the track around it; `active`
 * keeps it idle while the lens is hidden, where the track has no width to
 * place against.
 */
function LensPlayhead({ trackRef, duration, active }: { trackRef: React.RefObject<HTMLDivElement | null>; duration: number; active: boolean }) {
    const { playerRef, isPlaying, currentTime } = useVideo();
    const { currentTimeRef } = useVideoActions();
    return <Playhead playerRef={playerRef} currentTimeRef={currentTimeRef} duration={duration} barRef={trackRef} isPlaying={isPlaying} pausedTick={currentTime} announce={false} active={active} />;
}
