"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useVideo, useVideoActions } from '@/components/meetings/VideoProvider';
import { useHighlight } from '@/components/meetings/HighlightContext';
import { useCouncilMeetingData } from '@/components/meetings/CouncilMeetingDataContext';
import { useBarData } from './BarDataContext';
import { useBarHighlight } from './BarHighlightContext';
import { bandAt, intersectsAny, type BarBand, type Chapter, type Interval } from '@/lib/utils/barTimeline';
import { useLiveTime } from './useLiveTime';
import { nowBand, NowPlayingSubjectLink } from './nowPlaying';
import { TopicIcon } from '@/components/TopicIcon';
import { Users, Shapes } from 'lucide-react';
import type { BarMode } from './ModePicker';
import { cn, formatTimestamp } from '@/lib/utils';

export const DIM_OPACITY = 0.16;

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
export function BarTimeline({ mode, compact = false, announce = null, onAnnounceEnd }: { mode: BarMode; compact?: boolean; announce?: ModeAnnounce | null; onAnnounceEnd?: () => void }) {
    const t = useTranslations('transcript.controls');
    const router = useRouter();
    const { bands, contentDuration, chapters } = useBarData();
    const highlight = useBarHighlight();
    const { duration: mediaDuration, currentScrollInterval, currentTime, isPlaying } = useVideo();
    // Until the media reports metadata its duration is 0; the transcript's own
    // extent keeps the strip painted and clickable in the meantime.
    const duration = mediaDuration > 0 ? mediaDuration : contentDuration;
    const { seekTo, seekToWithoutScroll, currentTimeRef } = useVideoActions();
    const { playerRef } = useVideo();
    const { editingHighlight, highlightUtterances, previewMode, currentHighlightIndex } = useHighlight();
    const { city, meeting } = useCouncilMeetingData();

    const barRef = useRef<HTMLDivElement>(null);
    const cursorRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [hoverBand, setHoverBand] = useState<number>(-1);
    const [hovering, setHovering] = useState(false);
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
            // On a strip narrower than the tooltip the clamp would invert and
            // pin it part-way off; centring is the honest fallback.
            const clamped = rect.width < 220 ? rect.width / 2 : Math.min(Math.max(x, 110), rect.width - 110);
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
        setHovering(true);
        if (rafId.current === null) rafId.current = requestAnimationFrame(applyPointer);
    }, [applyPointer]);

    const onPointerLeave = useCallback(() => {
        pointerX.current = null;
        hoverBandRef.current = -1;
        setHoverBand(-1);
        setHovering(false);
        if (cursorRef.current) cursorRef.current.style.opacity = '0';
    }, []);

    useEffect(() => () => { if (rafId.current !== null) cancelAnimationFrame(rafId.current); }, []);

    // The rail decides label visibility in pixels, not fractions — a chapter
    // that is generous in a wide window may not carry its name in a narrow one.
    const [barWidth, setBarWidth] = useState(0);
    useEffect(() => {
        const el = barRef.current;
        if (!el) return;
        const observer = new ResizeObserver(entries => {
            const width = Math.round(entries[0]?.contentRect.width ?? 0);
            setBarWidth(prev => (Math.abs(prev - width) >= 1 ? width : prev));
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const timeFromEvent = (e: { clientX: number }): number | null => {
        const el = barRef.current;
        if (!el || duration <= 0) return null;
        const rect = el.getBoundingClientRect();
        const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
        return (x / rect.width) * duration;
    };

    // Where playback stood before the last click-seek: a double-click means
    // "open this subject", not "abandon my listening position" — the second
    // click restores it before navigating.
    const preSeekTime = useRef<number | null>(null);

    const onClick = (e: React.MouseEvent) => {
        const time = timeFromEvent(e);
        if (time !== null) {
            preSeekTime.current = currentTimeRef.current;
            seekTo(time);
        }
    };

    const onDoubleClick = (e: React.MouseEvent) => {
        if (mode !== 'subjects') return;
        const time = timeFromEvent(e);
        if (time === null) return;
        const idx = bandAt(bands, time);
        const subjectId = idx >= 0 ? bands[idx].subjectId : null;
        if (subjectId) {
            if (preSeekTime.current !== null) seekToWithoutScroll(preSeekTime.current);
            router.push(`/${city.id}/${meeting.id}/subjects/${subjectId}`);
        }
    };

    // Touch scrubbing: capture the pointer so the drag belongs to the strip
    // (touch-action-none keeps the browser from claiming it for panning),
    // preview along the way, seek where the finger lifts.
    const scrubbing = useRef(false);
    const onPointerDown = (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse' || !e.isPrimary) return;
        scrubbing.current = true;
        barRef.current?.setPointerCapture(e.pointerId);
        pointerX.current = e.clientX;
        if (rafId.current === null) rafId.current = requestAnimationFrame(applyPointer);
    };
    const onPointerUp = (e: React.PointerEvent) => {
        if (!scrubbing.current) return;
        scrubbing.current = false;
        const time = timeFromEvent(e);
        if (time !== null) seekTo(time);
        onPointerLeave();
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
    // The chapter rail rides inside the box on desktop only — at the phone's
    // 42px it would be crumbs, so the phone shows no chapters at all.
    const railed = !compact && chapters.length > 0;

    return (
        <div className="relative min-w-0 flex-1">
            {!compact && <NowLane bands={bands} />}
            <div
                ref={barRef}
                role="slider"
                aria-label={t('timeline')}
                aria-orientation="horizontal"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                // initial values only — the Playhead maintains both imperatively
                aria-valuenow={Math.round(currentTimeRef.current)}
                aria-valuetext={formatTimestamp(currentTimeRef.current)}
                tabIndex={0}
                onClick={onClick}
                onDoubleClick={onDoubleClick}
                onKeyDown={onKeyDown}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onPointerMove={onPointerMove}
                onPointerLeave={onPointerLeave}
                className={cn(
                    'relative w-full cursor-pointer touch-none overflow-hidden rounded-[10px] border-2 border-border bg-card',
                    compact ? 'h-[42px]' : 'h-[62px]',
                )}
            >
                {scrollBand && (
                    <div
                        aria-hidden
                        className={cn('absolute top-0 bg-yellow-200', railed ? 'h-[44px]' : 'h-full')}
                        style={{
                            left: `${(scrollBand[0] / duration) * 100}%`,
                            width: `${((scrollBand[1] - scrollBand[0]) / duration) * 100}%`,
                        }}
                    />
                )}

                <SegmentsLayer
                    railed={railed}
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
                                    'absolute top-0 cursor-pointer transition-colors hover:bg-amber-500',
                                    railed ? 'h-[44px]' : 'h-full',
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

                <Playhead playerRef={playerRef} currentTimeRef={currentTimeRef} duration={duration} barRef={barRef} isPlaying={isPlaying} pausedTick={currentTime} />

                {railed && (
                    <ChapterRail chapters={chapters} duration={duration} currentTime={currentTime} barWidth={barWidth} />
                )}

                {announce && (
                    <div
                        key={announce.key}
                        onAnimationEnd={onAnnounceEnd}
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
                    hovering ? 'block' : 'hidden',
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
const SegmentsLayer = memo(function SegmentsLayer({ bands, mode, duration, highlightKey, highlightRanges, dimAll, railed }: {
    bands: BarBand[];
    mode: BarMode;
    duration: number;
    highlightKey: string | null;
    highlightRanges: Interval[] | null;
    dimAll: boolean;
    railed: boolean;
}) {
    if (duration <= 0) return null;
    return (
        <div aria-hidden className="absolute inset-0">
            {bands.map((band, i) => {
                const lit = !highlightRanges || intersectsAny(band.start, band.end, highlightRanges);
                return (
                    <div
                        key={i}
                        className={cn(
                            'absolute transition-[opacity,top,height] duration-150',
                            railed
                                ? 'top-[6px] h-[38px] hover:top-[2px] hover:h-[42px]'
                                : 'top-[12.5%] h-3/4 hover:top-0 hover:h-full',
                        )}
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
    prev.highlightRanges === next.highlightRanges &&
    prev.railed === next.railed
);

/**
 * The line above the strip: who speaks and on what, centred over the timeline
 * it points into — only while playing. The total duration keeps the right
 * edge; the current time lives in the bubble over the play button. The
 * subject is a link into its page.
 */
function NowLane({ bands }: { bands: BarBand[] }) {
    const { city, meeting } = useCouncilMeetingData();
    const { isPlaying } = useVideo();
    const { currentTimeRef } = useVideoActions();
    const time = useLiveTime(currentTimeRef);
    const band = nowBand(bands, time, isPlaying);
    // The dock floats over the page, so the line wears a capsule — same
    // language as the time bubble over the play button. Left-aligned to the
    // strip it annotates; on pause the lane simply empties.
    return (
        <div className="relative mb-1 h-8">
            {band && (
                <div className="absolute inset-x-0 top-0 flex h-8 justify-start">
                    <div className="flex min-w-0 items-center gap-1.5 rounded-full border-2 border-border bg-card px-3 shadow-sm">
                        {band.speakerName && (
                            <>
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: band.speakerColor }} aria-hidden />
                                <span className="truncate text-xs font-extrabold">{band.speakerName}</span>
                            </>
                        )}
                        {band.speakerName && band.subjectId && band.subjectName && (
                            <span className="text-muted-foreground" aria-hidden>&middot;</span>
                        )}
                        {band.subjectId && band.subjectName && (
                            <NowPlayingSubjectLink band={band} cityId={city.id} meetingId={meeting.id} className="flex min-w-0 items-center gap-1.5 hover:underline">
                                <TopicIcon color={band.subjectColor} icon={band.subjectIcon} size="sm" />
                                <span className="truncate text-xs">{band.subjectName}</span>
                            </NowPlayingSubjectLink>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

const CHAPTER_LABEL_KEY = {
    beforeAgenda: 'chapterBeforeAgenda',
    agenda: 'chapterAgenda',
    outOfAgenda: 'chapterOutOfAgenda',
} as const;

/**
 * The chapter rail inside the box, under the bands: one muted span per
 * chapter, the one the playhead is in a shade darker, labels only where the
 * chapter is wide enough to carry them.
 */
function ChapterRail({ chapters, duration, currentTime, barWidth }: {
    chapters: Chapter[];
    duration: number;
    currentTime: number;
    barWidth: number;
}) {
    const t = useTranslations('transcript.controls');
    if (duration <= 0) return null;
    return (
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[18px]" style={{ zIndex: 5 }}>
            {/* the lane reads as a track, so the empty width belongs to something */}
            <div className="absolute inset-0 bg-muted/50" />
            {chapters.map((chapter, i) => {
                const end = i + 1 < chapters.length ? chapters[i + 1].start : duration;
                const active = currentTime >= chapter.start && currentTime < end;
                const fraction = (end - chapter.start) / duration;
                const label = t(CHAPTER_LABEL_KEY[chapter.key]);
                // ~7px per glyph at this size and tracking; the label renders
                // only when the chapter's pixels can carry it whole.
                const labelFits = fraction * barWidth >= label.length * 7 + 10;
                return (
                    <div
                        key={chapter.key}
                        className="absolute top-0 h-full"
                        style={{
                            left: `${(chapter.start / duration) * 100}%`,
                            width: `${fraction * 100}%`,
                        }}
                    >
                        {/* a stop line at the border, not a lane per chapter */}
                        {i > 0 && (
                            <div className="absolute bottom-[3px] left-0 h-[15px] w-[2px] -translate-x-1/2 rounded-full bg-muted-foreground/70" />
                        )}
                        {labelFits && (
                            <div className={cn(
                                'absolute top-1/2 flex -translate-y-1/2 items-center gap-1 whitespace-nowrap text-[8px] font-bold tracking-[0.07em]',
                                i === 0 ? 'left-[8px]' : 'left-[10px]',
                                active ? 'text-muted-foreground' : 'text-muted-foreground/60',
                            )}>
                                {label}
                                <span aria-hidden>{'\u2192'}</span>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/**
 * The playhead: a rAF loop reading the video element directly and writing a
 * transform — no React state, no 2-second jumps.
 */
function Playhead({ playerRef, currentTimeRef, duration, barRef, isPlaying, pausedTick }: {
    playerRef: React.MutableRefObject<HTMLVideoElement | null>;
    currentTimeRef: React.MutableRefObject<number>;
    duration: number;
    barRef: React.RefObject<HTMLDivElement | null>;
    isPlaying: boolean;
    /** the throttled clock — its changes reposition the paused playhead after seeks */
    pausedTick: number;
}) {
    const headRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let lastX = -1;
        let lastSecond = -1;
        const apply = (time: number) => {
            const el = headRef.current;
            const bar = barRef.current;
            if (!el || !bar || duration <= 0) return;
            const x = Math.min(Math.max(time / duration, 0), 1) * bar.clientWidth;
            if (Math.abs(x - lastX) >= 0.5) {
                lastX = x;
                el.style.transform = `translateX(${x}px)`;
            }
            // The slider's announced value lives outside React so playback
            // ticks never re-render the strip.
            const second = Math.round(time);
            if (second !== lastSecond) {
                lastSecond = second;
                bar.setAttribute('aria-valuenow', String(second));
                bar.setAttribute('aria-valuetext', formatTimestamp(time));
            }
        };

        // Paused, the ref is canonical and only changes through seeks, which
        // also bump the throttled clock — one positioning per change, no loop.
        if (!isPlaying) {
            apply(currentTimeRef.current);
            return;
        }

        // Playing, the media element advances between timeupdate events, so a
        // rAF loop reading it directly is what makes the playhead glide.
        let raf = 0;
        const tick = () => {
            raf = requestAnimationFrame(tick);
            const player = playerRef.current;
            apply(player && !player.paused ? player.currentTime : currentTimeRef.current);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [duration, playerRef, currentTimeRef, barRef, isPlaying, pausedTick]);

    return (
        <div ref={headRef} aria-hidden className="pointer-events-none absolute left-0 top-0 h-full" style={{ zIndex: 11 }}>
            <div className="h-full w-[2px] -translate-x-1/2 bg-slate-700" />
            <div className="absolute left-0 top-[1px] h-[9px] w-[9px] -translate-x-1/2 rounded-full bg-slate-700" />
        </div>
    );
}
