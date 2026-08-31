"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useVideo, useVideoActions } from '@/components/meetings/VideoProvider';
import { useHighlight } from '@/components/meetings/HighlightContext';
import { useCouncilMeetingData } from '@/components/meetings/CouncilMeetingDataContext';
import { useBarData } from './BarDataContext';
import { useBarHighlight } from './BarHighlightContext';
import { bandAt, intersectsAny, type BarBand, type Interval } from '@/lib/utils/barTimeline';
import { TopicIcon } from '@/components/TopicIcon';
import { Users, Shapes } from 'lucide-react';
import type { BarMode } from './ModePicker';
import { cn, formatTimestamp } from '@/lib/utils';

const DIM_OPACITY = 0.16;

/** One explicit mode switch — the key remounts the overlay so the animation replays. */
export interface ModeAnnounce {
    mode: BarMode;
    key: number;
}

/**
 * The coloured strip. Three layers with three very different update rates:
 * the segment bands re-render only when the mode or the highlight changes;
 * the playhead runs on requestAnimationFrame straight against the video
 * element; the hover layer throttles pointer moves to one rAF and touches
 * React state only when the band under the cursor changes.
 */
export function BarTimeline({ mode, compact = false, announce = null }: { mode: BarMode; compact?: boolean; announce?: ModeAnnounce | null }) {
    const t = useTranslations('transcript.controls');
    const router = useRouter();
    const { bands, contentDuration } = useBarData();
    const highlight = useBarHighlight();
    const { duration: mediaDuration, currentScrollInterval } = useVideo();
    // Until the media reports metadata its duration is 0; the transcript's own
    // extent keeps the strip painted and clickable in the meantime.
    const duration = mediaDuration > 0 ? mediaDuration : contentDuration;
    const { seekTo, currentTimeRef } = useVideoActions();
    const { playerRef } = useVideo();
    const { editingHighlight, highlightUtterances, previewMode, currentHighlightIndex } = useHighlight();
    const { city, meeting } = useCouncilMeetingData();

    const barRef = useRef<HTMLDivElement>(null);
    const cursorRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [hoverBand, setHoverBand] = useState<number>(-1);
    const hoverBandRef = useRef(-1);

    const isHighlightMode = editingHighlight !== null;

    // amber layer rows, memoized with Set-based membership (was O(n·m) per render)
    const editRows = useMemo(() => {
        if (!isHighlightMode || !highlightUtterances) return null;
        const included = new Set(editingHighlight.highlightedUtterances.map(hu => hu.utteranceId));
        return highlightUtterances
            .map((u, index) => ({ u, index }))
            .filter(({ u }) => included.has(u.id));
    }, [isHighlightMode, editingHighlight, highlightUtterances]);

    // ── pointer handling: one rAF per burst, state only on band change ──
    const pointerX = useRef<number | null>(null);
    const rafId = useRef<number | null>(null);

    const applyPointer = useCallback(() => {
        rafId.current = null;
        const el = barRef.current;
        if (!el || duration <= 0) return;
        const rect = el.getBoundingClientRect();
        if (pointerX.current === null) return;
        const x = Math.min(Math.max(pointerX.current - rect.left, 0), rect.width);
        if (cursorRef.current) {
            cursorRef.current.style.transform = `translateX(${x}px)`;
            cursorRef.current.style.opacity = '1';
        }
        if (tooltipRef.current) {
            const clamped = Math.min(Math.max(x, 110), rect.width - 110);
            tooltipRef.current.style.transform = `translateX(${clamped}px) translateX(-50%)`;
            const timeEl = tooltipRef.current.querySelector('[data-bar-time]');
            if (timeEl) timeEl.textContent = formatTimestamp((x / rect.width) * duration);
        }
        const time = (x / rect.width) * duration;
        const idx = bandAt(bands, time);
        if (idx !== hoverBandRef.current) {
            hoverBandRef.current = idx;
            setHoverBand(idx);
        }
    }, [bands, duration]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        pointerX.current = e.clientX;
        if (rafId.current === null) rafId.current = requestAnimationFrame(applyPointer);
    }, [applyPointer]);

    const onPointerLeave = useCallback(() => {
        pointerX.current = null;
        hoverBandRef.current = -1;
        setHoverBand(-1);
        if (cursorRef.current) cursorRef.current.style.opacity = '0';
    }, []);

    useEffect(() => () => { if (rafId.current !== null) cancelAnimationFrame(rafId.current); }, []);

    const timeFromEvent = (e: React.MouseEvent): number | null => {
        const el = barRef.current;
        if (!el || duration <= 0) return null;
        const rect = el.getBoundingClientRect();
        return ((e.clientX - rect.left) / rect.width) * duration;
    };

    const onClick = (e: React.MouseEvent) => {
        const time = timeFromEvent(e);
        if (time !== null) seekTo(time);
    };

    const onDoubleClick = (e: React.MouseEvent) => {
        if (mode !== 'subjects') return;
        const time = timeFromEvent(e);
        if (time === null) return;
        const idx = bandAt(bands, time);
        const subjectId = idx >= 0 ? bands[idx].subjectId : null;
        if (subjectId) router.push(`/${city.id}/${meeting.id}/subjects/${subjectId}`);
    };

    const onKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (duration <= 0) return;
        const step = duration * 0.01;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            seekTo(Math.min(duration, currentTimeRef.current + step));
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            seekTo(Math.max(0, currentTimeRef.current - step));
        } else if (e.key === 'Home') {
            e.preventDefault();
            seekTo(0);
        } else if (e.key === 'End') {
            e.preventDefault();
            seekTo(duration);
        }
    }, [duration, seekTo, currentTimeRef]);

    const hovered = hoverBand >= 0 ? bands[hoverBand] : null;
    const scrollBand = currentScrollInterval[0] !== currentScrollInterval[1] && duration > 0 ? currentScrollInterval : null;

    return (
        <div className="relative min-w-0 flex-1">
            <div
                ref={barRef}
                role="slider"
                aria-label={t('timeline')}
                aria-orientation="horizontal"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                aria-valuenow={Math.round(currentTimeRef.current)}
                tabIndex={0}
                onClick={onClick}
                onDoubleClick={onDoubleClick}
                onKeyDown={onKeyDown}
                onPointerMove={onPointerMove}
                onPointerLeave={onPointerLeave}
                className={cn(
                    'relative w-full cursor-pointer overflow-hidden rounded-[10px] border-2 border-border bg-card',
                    compact ? 'h-[42px]' : 'h-[50px]',
                )}
            >
                {scrollBand && (
                    <div
                        aria-hidden
                        className="absolute top-0 h-full bg-yellow-200"
                        style={{
                            left: `${(scrollBand[0] / duration) * 100}%`,
                            width: `${((scrollBand[1] - scrollBand[0]) / duration) * 100}%`,
                        }}
                    />
                )}

                <SegmentsLayer
                    bands={bands}
                    mode={mode}
                    duration={duration}
                    highlightKey={highlight?.key ?? null}
                    highlightRanges={highlight?.ranges ?? null}
                    dimAll={isHighlightMode}
                />

                {editRows && duration > 0 && (
                    <div aria-hidden className="absolute inset-0" style={{ zIndex: 10 }}>
                        {editRows.map(({ u, index }) => (
                            <div
                                key={u.id}
                                onClick={e => { e.stopPropagation(); seekTo(u.startTimestamp); }}
                                title={`${u.speakerName}: ${u.text.substring(0, 50)}…`}
                                className={cn(
                                    'absolute top-0 h-full cursor-pointer transition-colors hover:bg-amber-500',
                                    previewMode && index === currentHighlightIndex ? 'bg-amber-600' : 'bg-amber-400',
                                )}
                                style={{
                                    left: `${(u.startTimestamp / duration) * 100}%`,
                                    width: `${((u.endTimestamp - u.startTimestamp) / duration) * 100}%`,
                                }}
                            />
                        ))}
                    </div>
                )}

                <Playhead playerRef={playerRef} currentTimeRef={currentTimeRef} duration={duration} barRef={barRef} />

                {announce && (
                    <div
                        key={announce.key}
                        aria-hidden
                        className="pointer-events-none absolute inset-0 flex animate-[bar-mode-announce_2.4s_ease-in-out_forwards] items-center justify-center gap-2 bg-card/85 opacity-0"
                        style={{ zIndex: 12 }}
                    >
                        {announce.mode === 'speakers'
                            ? <Users className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden />
                            : <Shapes className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden />}
                        <span className={cn('-mr-[0.25em] font-black tracking-[0.25em]', compact ? 'text-sm' : 'text-lg')}>
                            {t(announce.mode === 'speakers' ? 'modeAnnounceSpeakers' : 'modeAnnounceSubjects')}
                        </span>
                    </div>
                )}

                <div
                    ref={cursorRef}
                    aria-hidden
                    className="pointer-events-none absolute left-0 top-0 h-full w-px bg-gray-500 opacity-0"
                    style={{ zIndex: 12 }}
                />
            </div>

            {/* tooltip: position via transform (rAF), content via band-change state */}
            <div
                ref={tooltipRef}
                aria-hidden
                className={cn(
                    'pointer-events-none absolute bottom-[calc(100%+8px)] left-0 z-30 w-[220px] rounded-[10px] border-2 border-border bg-card p-2.5 shadow-lg',
                    hovered ? 'block' : 'hidden',
                )}
            >
                <div data-bar-time className="border-b border-border/60 pb-1.5 text-xs font-extrabold tabular-nums" />
                {hovered && hovered.speakerName && (
                    <div className="mt-1.5 flex items-center gap-2">
                        {/* the party dot, as parties are marked everywhere else — centred
                            on the same 24px rail as the topic badge below it */}
                        <span className="flex w-6 shrink-0 justify-center" aria-hidden>
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hovered.speakerColor }} />
                        </span>
                        <span className="truncate text-xs font-bold">{hovered.speakerName}</span>
                    </div>
                )}
                {hovered && hovered.subjectName && (
                    <div className="mt-1.5 flex items-start gap-2">
                        <TopicIcon color={hovered.subjectColor} icon={hovered.subjectIcon} size="sm" />
                        <span className="min-w-0 pt-0.5 text-xs leading-snug">{hovered.subjectName}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * The bands. Renders only when the transcript, the mode, or the highlight
 * changes — playback ticks and pointer moves never reach it.
 */
const SegmentsLayer = memo(function SegmentsLayer({ bands, mode, duration, highlightKey, highlightRanges, dimAll }: {
    bands: BarBand[];
    mode: BarMode;
    duration: number;
    highlightKey: string | null;
    highlightRanges: Interval[] | null;
    dimAll: boolean;
}) {
    if (duration <= 0) return null;
    return (
        <div aria-hidden className="absolute inset-0">
            {bands.map((band, i) => {
                const lit = !highlightRanges || intersectsAny(band.start, band.end, highlightRanges);
                return (
                    <div
                        key={i}
                        className="absolute top-[12.5%] h-3/4 transition-[opacity,top,height] duration-150 hover:top-0 hover:h-full"
                        style={{
                            left: `${(band.start / duration) * 100}%`,
                            width: `${Math.max(((band.end - band.start) / duration) * 100, 0.05)}%`,
                            backgroundColor: mode === 'speakers' ? band.speakerColor : band.subjectColor,
                            opacity: dimAll ? 0.3 : lit ? 1 : DIM_OPACITY,
                        }}
                    />
                );
            })}
        </div>
    );
}, (prev, next) =>
    prev.bands === next.bands &&
    prev.mode === next.mode &&
    prev.duration === next.duration &&
    prev.dimAll === next.dimAll &&
    prev.highlightKey === next.highlightKey &&
    prev.highlightRanges === next.highlightRanges
);

/**
 * The playhead: a rAF loop reading the video element directly and writing a
 * transform — no React state, no 2-second jumps.
 */
function Playhead({ playerRef, currentTimeRef, duration, barRef }: {
    playerRef: React.MutableRefObject<HTMLVideoElement | null>;
    currentTimeRef: React.MutableRefObject<number>;
    duration: number;
    barRef: React.RefObject<HTMLDivElement | null>;
}) {
    const headRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let raf = 0;
        let lastX = -1;
        const tick = () => {
            raf = requestAnimationFrame(tick);
            const el = headRef.current;
            const bar = barRef.current;
            if (!el || !bar || duration <= 0) return;
            // While playing, the media element advances between timeupdate events, so
            // reading it directly is what makes the playhead glide. Paused (or before
            // the first play, when seeks deliberately leave the element alone), the
            // provider's ref is the canonical position.
            const player = playerRef.current;
            const time = player && !player.paused ? player.currentTime : currentTimeRef.current;
            const x = Math.min(Math.max(time / duration, 0), 1) * bar.clientWidth;
            if (Math.abs(x - lastX) >= 0.5) {
                lastX = x;
                el.style.transform = `translateX(${x}px)`;
            }
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [duration, playerRef, currentTimeRef, barRef]);

    return (
        <div ref={headRef} aria-hidden className="pointer-events-none absolute left-0 top-0 h-full" style={{ zIndex: 11 }}>
            <div className="h-full w-[2px] -translate-x-1/2 bg-slate-700" />
            <div className="absolute left-0 top-[1px] h-[9px] w-[9px] -translate-x-1/2 rounded-full bg-slate-700" />
        </div>
    );
}
