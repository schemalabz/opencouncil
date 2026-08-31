"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, Loader, Pause, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useVideo, useVideoActions } from '@/components/meetings/VideoProvider';
import { useHighlight } from '@/components/meetings/HighlightContext';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useBarData } from './BarDataContext';
import { useBarHighlight } from './BarHighlightContext';
import { BarTimeline, DIM_OPACITY, type ModeAnnounce } from './BarTimeline';
import { useLiveTime } from './useLiveTime';
import { nowBand, NowPlayingSubjectLink } from './nowPlaying';
import { useCouncilMeetingData } from '@/components/meetings/CouncilMeetingDataContext';
import { MiniVideo } from './MiniVideo';
import { ModePicker, type BarMode } from './ModePicker';
import { intersectsAny } from '@/lib/utils/barTimeline';
import { cn, formatTimestamp } from '@/lib/utils';

interface BarModeContextType {
    mode: BarMode;
    setMode: (mode: BarMode) => void;
}
const BarModeContext = createContext<BarModeContextType | null>(null);

export function BarModeProvider({ children }: { children: React.ReactNode }) {
    const [mode, setMode] = useState<BarMode>('speakers');
    const value = useMemo(() => ({ mode, setMode }), [mode]);
    return <BarModeContext.Provider value={value}>{children}</BarModeContext.Provider>;
}

/** The subject page presets the subjects mode; anyone may flip it back. */
export function useBarMode(): BarModeContextType {
    const ctx = useContext(BarModeContext);
    if (!ctx) throw new Error('useBarMode must be used within a BarModeProvider');
    return ctx;
}

const COLLAPSED_KEY = 'oc-playback-bar-collapsed';

/**
 * The playback dock: play · video · bar · mode picker on one rounded row at
 * the bottom of every meeting page. On phones the same row anchors to the
 * bottom edge and collapses into a pill, so nothing ever floats over the
 * text the way the old right-side rail did.
 */
export function PlaybackBar() {
    const t = useTranslations('transcript.controls');
    const isMobile = useMediaQuery('(max-width: 767px)');
    const { mode, setMode } = useBarMode();
    const { hasSubjectData } = useBarData();
    const [collapsed, setCollapsed] = useState(false);

    // Set only by the picker, never by the subject page's programmatic preset:
    // the big label teaches what the button does, so it follows the button.
    const [announce, setAnnounce] = useState<ModeAnnounce | null>(null);
    const announceSeq = useRef(0);
    const switchMode = (m: BarMode) => {
        setMode(m);
        setAnnounce({ mode: m, key: ++announceSeq.current });
    };

    useEffect(() => {
        try {
            setCollapsed(sessionStorage.getItem(COLLAPSED_KEY) === '1');
        } catch { /* storage may be unavailable */ }
    }, []);

    const setCollapsedPersisted = (value: boolean) => {
        setCollapsed(value);
        // A display:none round-trip restarts CSS animations; a finished
        // announcement must not replay on every expand.
        if (value) setAnnounce(null);
        try { sessionStorage.setItem(COLLAPSED_KEY, value ? '1' : '0'); } catch { /* ignore */ }
    };

    const effectiveMode: BarMode = hasSubjectData ? mode : 'speakers';

    const pill = isMobile && collapsed;

    // The pill never replaces the dock in the tree — it only covers it. A
    // hidden dock keeps the media element mounted, so play works from the
    // pill and expanding is a visibility flip, not a remount mid-playback.
    return (
        <>
            {pill && <BarPill mode={effectiveMode} onExpand={() => setCollapsedPersisted(false)} />}
        <div
            className={cn(
                'fixed inset-x-2 z-50',
                isMobile ? 'bottom-0 -mx-2 border-t-2 border-border bg-background px-2.5 pt-1.5' : 'bottom-2',
                pill && 'hidden',
            )}
            style={isMobile ? { paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' } : undefined}
        >
            {isMobile && (
                <button
                    type="button"
                    onClick={() => setCollapsedPersisted(true)}
                    aria-label={t('collapseBar')}
                    className="mx-auto mb-1.5 block h-4 w-full max-w-[120px]"
                >
                    <span className="mx-auto block h-1 w-9 rounded-full bg-border" aria-hidden />
                </button>
            )}
            <div className="flex items-end gap-2">
                <div className="relative shrink-0">
                    {!isMobile && <NowBubble />}
                    <PlayButton compact={isMobile} />
                </div>
                <MiniVideo compact={isMobile} />
                <BarTimeline mode={effectiveMode} compact={isMobile} announce={announce} onAnnounceEnd={() => setAnnounce(null)} />
                {hasSubjectData && <ModePicker mode={effectiveMode} onModeChange={switchMode} compact={isMobile} />}
                <div className="self-center"><ClipNav /></div>
            </div>
            {isMobile && <TimeReadout />}
        </div>
        </>
    );
}

/** The play control — the one leaf that genuinely needs the ticking context. */
function PlayButton({ compact }: { compact: boolean }) {
    const t = useTranslations('transcript.controls');
    const { isPlaying, isSeeking, togglePlayPause } = useVideo();
    return (
        <button
            type="button"
            onClick={togglePlayPause}
            aria-label={isPlaying ? t('pause') : t('play')}
            className={cn(
                'flex shrink-0 items-center justify-center rounded-[10px] border-2 border-border bg-card hover:bg-muted',
                compact ? 'h-[42px] w-[42px]' : 'h-[62px] w-[62px]',
            )}
        >
            {isPlaying
                ? (isSeeking ? <Loader className="h-5 w-5 animate-spin" aria-hidden /> : <Pause className="h-5 w-5" aria-hidden />)
                : <Play className="h-5 w-5" aria-hidden />}
        </button>
    );
}

function TimeReadout() {
    const { currentTime, duration, isPlaying } = useVideo();
    const { bands } = useBarData();
    const { city, meeting } = useCouncilMeetingData();
    const band = nowBand(bands, currentTime, isPlaying);
    return (
        <div className="mt-1 flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
            <span className="shrink-0 font-bold text-foreground">{formatTimestamp(currentTime)}</span>
            <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
                {band && band.speakerName && (
                    <>
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: band.speakerColor }} aria-hidden />
                        <span className="shrink-0 font-bold text-foreground">{band.speakerName}</span>
                    </>
                )}
                {band && band.subjectId && band.subjectName && (
                    <NowPlayingSubjectLink band={band} cityId={city.id} meetingId={meeting.id} className="truncate">
                        &middot; {band.subjectName}
                    </NowPlayingSubjectLink>
                )}
            </span>
            <span className="shrink-0">{duration > 0 ? formatTimestamp(duration) : '\u2014'}</span>
        </div>
    );
}

/** The clock over the play button — polls the ref, so it ticks like a clock. */
function NowBubble() {
    const { duration } = useVideo();
    const { currentTimeRef } = useVideoActions();
    const time = useLiveTime(currentTimeRef);
    return (
        <div className="pointer-events-none absolute -top-9 left-0 flex h-8 w-max items-center gap-1 rounded-full border-2 border-border bg-card px-3 shadow-sm text-[11px] tabular-nums">
            <span className="font-extrabold">{formatTimestamp(time)}</span>
            <span className="text-muted-foreground">/ {duration > 0 ? formatTimestamp(duration) : '\u2014'}</span>
        </div>
    );
}

/** Clip navigation while editing a highlight — carried over, now localized. */
function ClipNav() {
    const t = useTranslations('transcript.controls');
    const { editingHighlight, highlightUtterances, currentHighlightIndex, goToPreviousHighlight, goToNextHighlight } = useHighlight();
    if (!editingHighlight || !highlightUtterances || highlightUtterances.length === 0) return null;
    return (
        <div className="flex shrink-0 items-center gap-1" aria-live="polite">
            <button
                type="button"
                onClick={goToPreviousHighlight}
                aria-label={t('previousClip')}
                title={t('previousClip')}
                className="flex h-6 w-6 items-center justify-center rounded border border-border bg-card hover:bg-muted"
            >
                <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <div className="rounded border border-amber-200 bg-amber-100 px-2 py-1 text-xs text-amber-900">
                {t('clip', { current: currentHighlightIndex + 1, total: highlightUtterances.length })}
            </div>
            <button
                type="button"
                onClick={goToNextHighlight}
                aria-label={t('nextClip')}
                title={t('nextClip')}
                className="flex h-6 w-6 items-center justify-center rounded border border-border bg-card hover:bg-muted"
            >
                <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
        </div>
    );
}

/**
 * The collapsed phone state: play, the bar as a sliver (same bands, same
 * highlight dimming), the elapsed time, and the way back up.
 */
function BarPill({ mode, onExpand }: { mode: BarMode; onExpand: () => void }) {
    const t = useTranslations('transcript.controls');
    const { bands, contentDuration } = useBarData();
    const highlight = useBarHighlight();
    const { isPlaying, isSeeking, togglePlayPause, currentTime, duration: mediaDuration } = useVideo();
    const duration = mediaDuration > 0 ? mediaDuration : contentDuration;

    // At sliver scale a pixel is ~50 seconds, so same-paint neighbours melt
    // into one span — a few dozen spans instead of one per band.
    const sliverSpans = useMemo(() => {
        const out: { start: number; end: number; color: string; lit: boolean }[] = [];
        for (const band of bands) {
            const color = mode === 'speakers' ? band.speakerColor : band.subjectColor;
            const lit = !highlight || intersectsAny(band.start, band.end, highlight.ranges);
            const last = out[out.length - 1];
            if (last && last.color === color && last.lit === lit && band.start - last.end < 30) {
                last.end = band.end;
            } else {
                out.push({ start: band.start, end: band.end, color, lit });
            }
        }
        return out;
    }, [bands, mode, highlight]);

    return (
        <div
            className="fixed inset-x-3 z-50 flex items-center gap-2.5 rounded-full border-2 border-border bg-card py-1 pl-2.5 pr-1.5 shadow-lg"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
        >
            <button
                type="button"
                onClick={togglePlayPause}
                aria-label={isPlaying ? t('pause') : t('play')}
                className="flex h-6 w-6 shrink-0 items-center justify-center"
            >
                {isPlaying
                    ? (isSeeking ? <Loader className="h-4 w-4 animate-spin" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />)
                    : <Play className="h-4 w-4" aria-hidden />}
            </button>
            <button
                type="button"
                onClick={onExpand}
                aria-label={t('expandBar')}
                className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
            >
                {duration > 0 && (
                    <span
                        aria-hidden
                        className="absolute inset-y-0 z-10 w-[3px] rounded-full bg-foreground shadow-[0_0_0_1px_hsl(var(--card))]"
                        style={{ left: `${Math.min((currentTime / duration) * 100, 99.5)}%` }}
                    />
                )}
                {duration > 0 && sliverSpans.map((span, i) => (
                    <span
                        key={i}
                        aria-hidden
                        className="absolute top-0 h-full"
                        style={{
                            left: `${(span.start / duration) * 100}%`,
                            width: `${Math.max(((span.end - span.start) / duration) * 100, 0.4)}%`,
                            backgroundColor: span.color,
                            opacity: span.lit ? 1 : DIM_OPACITY,
                        }}
                    />
                ))}
            </button>
            <span className="shrink-0 text-[11px] font-bold tabular-nums">{formatTimestamp(currentTime)}</span>
            <button
                type="button"
                onClick={onExpand}
                aria-label={t('expandBar')}
                className="flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground"
            >
                <ChevronUp className="h-4 w-4" aria-hidden />
            </button>
        </div>
    );
}
