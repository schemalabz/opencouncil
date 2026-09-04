"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, Loader, Pause, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useVideo, useVideoActions } from '@/components/meetings/VideoProvider';
import { useHighlight } from '@/components/meetings/HighlightContext';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useStoredState } from '@/hooks/useStoredState';
import { useBarData } from './BarDataContext';
import { useBarHighlight } from './BarHighlightContext';
import { BarTimeline, DIM_OPACITY, type ModeAnnounce } from './BarTimeline';
import { useLiveTime } from './useLiveTime';
import { nowBand, NowPlayingSubjectLink } from './nowPlaying';
import { DOCK_GAP, DOCK_ROW, DOCK_ROW_COMPACT, MINI_VIDEO_WIDTH } from './geometry';
import { useCouncilMeetingData } from '@/components/meetings/CouncilMeetingDataContext';
import { MiniVideo } from './MiniVideo';
import { ModePicker, type BarMode } from './ModePicker';
import { coalesceSpans, intersectsAny, type BarBand } from '@/lib/utils/barTimeline';
import { cn, formatTimestamp } from '@/lib/utils';

interface BarModeContextType {
    mode: BarMode;
    setMode: (mode: BarMode) => void;
}
const BarModeContext = createContext<BarModeContextType | null>(null);
const BarModeSetterContext = createContext<((mode: BarMode) => void) | null>(null);

export function BarModeProvider({ children }: { children: React.ReactNode }) {
    const [mode, setMode] = useState<BarMode>('speakers');
    const value = useMemo(() => ({ mode, setMode }), [mode]);
    return (
        <BarModeSetterContext.Provider value={setMode}>
            <BarModeContext.Provider value={value}>{children}</BarModeContext.Provider>
        </BarModeSetterContext.Provider>
    );
}

/** The subject page presets the subjects mode; anyone may flip it back. */
export function useBarMode(): BarModeContextType {
    const ctx = useContext(BarModeContext);
    if (!ctx) throw new Error('useBarMode must be used within a BarModeProvider');
    return ctx;
}

/** The setter alone — identity-stable, so a whole page can preset the mode without re-rendering on flips. */
export function useBarModeSetter(): (mode: BarMode) => void {
    const ctx = useContext(BarModeSetterContext);
    if (!ctx) throw new Error('useBarModeSetter must be used within a BarModeProvider');
    return ctx;
}

const COLLAPSED_KEY = 'oc-playback-bar-collapsed';

function parseCollapsed(raw: string): boolean | undefined {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return undefined;
}

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
    const { bands, hasSubjectData } = useBarData();
    const [collapsed, setCollapsed] = useStoredState(COLLAPSED_KEY, parseCollapsed, false, 'session');

    // Set only by the picker, never by the subject page's programmatic preset:
    // the big label teaches what the button does, so it follows the button.
    const [announce, setAnnounce] = useState<ModeAnnounce | null>(null);
    const announceSeq = useRef(0);
    const switchMode = (m: BarMode) => {
        setMode(m);
        setAnnounce({ mode: m, key: ++announceSeq.current });
    };

    const setCollapsedPersisted = (value: boolean) => {
        setCollapsed(value);
        // A display:none round-trip restarts CSS animations; a finished
        // announcement must not replay on every expand.
        if (value) setAnnounce(null);
    };

    const effectiveMode: BarMode = hasSubjectData ? mode : 'speakers';

    const pill = isMobile && collapsed;

    // The pill never replaces the dock in the tree — it only covers it. A
    // hidden dock keeps the media element mounted, so play works from the
    // pill and expanding is a visibility flip, not a remount mid-playback.
    return (
        <>
            <NowAnnouncer bands={bands} />
            {pill && <BarPill mode={effectiveMode} onExpand={() => setCollapsedPersisted(false)} />}
        <div
            data-playback-focus=""
            className={cn(
                // A finger held on the strip must scrub, not start a text
                // selection or an iOS callout on the readouts around it. No
                // autoprefixer here, so WebKit gets its prefixed property.
                'fixed inset-x-2 z-50 select-none [-webkit-user-select:none] [-webkit-touch-callout:none]',
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
                <BarTimeline mode={effectiveMode} compact={isMobile} announce={announce} onAnnounceEnd={() => setAnnounce(null)} dormant={pill} />
                {hasSubjectData && <ModePicker mode={effectiveMode} onModeChange={switchMode} compact={isMobile} />}
                <div className="self-center"><ClipNav /></div>
            </div>
            {isMobile && !pill && <TimeReadout />}
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
            className="flex shrink-0 items-center justify-center rounded-[10px] border-2 border-border bg-card hover:bg-muted"
            style={{ height: compact ? DOCK_ROW_COMPACT : DOCK_ROW, width: compact ? DOCK_ROW_COMPACT : DOCK_ROW }}
        >
            {isPlaying
                ? (isSeeking ? <Loader className="h-5 w-5 animate-spin" aria-hidden /> : <Pause className="h-5 w-5" aria-hidden />)
                : <Play className="h-5 w-5" aria-hidden />}
        </button>
    );
}

/** How often the announcer looks at the clock. */
const ANNOUNCE_POLL_MS = 1000;
/**
 * How long a band has to hold before it is announced. The lane and the readout
 * change with every turn of the floor; a reader must hear who holds it, not
 * every interjection on the way there.
 */
const ANNOUNCE_DWELL_MS = 4000;

/**
 * What the now-lane and the phone readout show, for a reader who sees neither.
 * Nothing else in the dock speaks: the strip's slider announces a time, and a
 * time does not say who is talking.
 *
 * The region starts empty and stays empty until the band changes, so arriving
 * on the page announces nothing, and a band that does not hold for the dwell
 * announces nothing either.
 */
function NowAnnouncer({ bands }: { bands: BarBand[] }) {
    const t = useTranslations('transcript.controls');
    const { isPlaying } = useVideo();
    const { currentTimeRef } = useVideoActions();
    const time = useLiveTime(currentTimeRef, isPlaying, ANNOUNCE_POLL_MS);
    const band = nowBand(bands, time, isPlaying);

    const text = !band ? ''
        : band.speakerName && band.subjectName ? t('nowSpeakingOn', { speaker: band.speakerName, subject: band.subjectName })
            : band.speakerName ? t('nowSpeaking', { speaker: band.speakerName })
                : band.subjectName ? t('nowSubject', { subject: band.subjectName })
                    : '';

    const [announced, setAnnounced] = useState('');
    // Seeded with the band at mount, so the first run of the effect — and its
    // second under StrictMode — announces nothing.
    const spoken = useRef(text);

    useEffect(() => {
        if (text === spoken.current) return;
        spoken.current = text;
        if (!text) return;
        const timer = setTimeout(() => setAnnounced(text), ANNOUNCE_DWELL_MS);
        return () => clearTimeout(timer);
    }, [text]);

    return <div className="sr-only" role="status" aria-live="polite">{announced}</div>;
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

/**
 * The clock over the play button — polls the ref, so it ticks like a clock.
 * As wide as the play button and the video together, so the now-lane beside
 * it starts exactly where the strip starts.
 */
function NowBubble() {
    const { duration, isPlaying } = useVideo();
    const { currentTimeRef } = useVideoActions();
    const time = useLiveTime(currentTimeRef, isPlaying);
    return (
        <div
            className="pointer-events-none absolute -top-9 left-0 flex h-8 items-center justify-center gap-1 rounded-[10px] border-2 border-border bg-card px-3 shadow-sm text-[11px] tabular-nums"
            style={{ width: DOCK_ROW + DOCK_GAP + MINI_VIDEO_WIDTH }}
        >
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

/** How far apart two same-paint bands can be and still read as one span on the sliver. */
const SLIVER_GAP_SECONDS = 30;

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
    const sliverSpans = useMemo(() => coalesceSpans(
        bands,
        band => mode === 'speakers' ? band.speakerColor : band.subjectColor,
        band => !highlight || intersectsAny(band.start, band.end, highlight.ranges),
        SLIVER_GAP_SECONDS,
    ), [bands, mode, highlight]);

    return (
        <div
            data-playback-focus=""
            className="fixed inset-x-3 z-50 flex select-none items-center gap-2.5 rounded-full border-2 border-border bg-card py-1 pl-2.5 pr-1.5 shadow-lg [-webkit-user-select:none] [-webkit-touch-callout:none]"
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
