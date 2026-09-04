"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Video } from '@/components/meetings/Video';
import { useVideoActions } from '@/components/meetings/VideoProvider';
import { useHighlight } from '@/components/meetings/HighlightContext';
import { useTranscriptOptions } from '@/components/meetings/options/OptionsContext';
import { DOCK_ROW, DOCK_ROW_COMPACT, MINI_VIDEO_WIDTH, MINI_VIDEO_WIDTH_COMPACT } from './geometry';
import { cycleSpeed, formatSpeed, sameSpeed, SPEED_MENU } from '@/lib/utils/barTimeline';
import { cn } from '@/lib/utils';

const LONG_PRESS_MS = 450;

/**
 * The dock's video: the thumbnail with its two standing affordances — the
 * expand badge (bottom-right, no hover needed) and the speed badge
 * (bottom-left: a click or a key cycles, a long press or a right-click opens
 * the menu, lit when the speed is not 1×).
 */
export function MiniVideo({ compact = false }: { compact?: boolean }) {
    const t = useTranslations('transcript.controls');
    const { options, updateOptions } = useTranscriptOptions();
    const { handleSpeedChange } = useVideoActions();
    const { isPreviewDialogOpen } = useHighlight();
    const [isExpanded, setIsExpanded] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressed = useRef(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    const speed = options.playbackSpeed;

    const setSpeed = useCallback((value: number) => {
        updateOptions({ playbackSpeed: value });
        handleSpeedChange(String(value));
    }, [updateOptions, handleSpeedChange]);

    // The pointer only ever decides whether this is a long press. The cycling
    // itself hangs off click, which a pointer and a keyboard both dispatch —
    // pointerup does not exist for someone pressing Enter on the badge.
    const onPressStart = (e: React.PointerEvent) => {
        // Only a primary press opens the menu: right-click has its own handler
        // (on Windows it fires after pointerup), middle-click means paste.
        if (e.button !== 0) return;
        longPressed.current = false;
        pressTimer.current = setTimeout(() => {
            longPressed.current = true;
            setMenuOpen(true);
        }, LONG_PRESS_MS);
    };
    const stopPress = () => {
        if (pressTimer.current) clearTimeout(pressTimer.current);
    };
    const onBadgeClick = () => {
        // The click that ends a long press belongs to the menu it opened.
        if (longPressed.current || menuOpen) {
            longPressed.current = false;
            return;
        }
        setSpeed(cycleSpeed(speed));
    };

    // close the menu on any outside press
    useEffect(() => {
        if (!menuOpen) return;
        const close = (e: PointerEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
        };
        window.addEventListener('pointerdown', close);
        return () => window.removeEventListener('pointerdown', close);
    }, [menuOpen]);

    const size = compact
        ? { height: DOCK_ROW_COMPACT, width: MINI_VIDEO_WIDTH_COMPACT }
        : { height: DOCK_ROW, width: MINI_VIDEO_WIDTH };

    return (
        <div ref={wrapRef} className="relative shrink-0" style={size}>
            {/* The floating expanded player stays a DOM child of this slot, so the
                empty-tray look must come from the background alone — an opacity on
                this wrapper would composite onto the fixed child too. */}
            <div className={cn(
                'h-full w-full overflow-hidden rounded-[10px] border-2 border-border',
                isExpanded ? 'bg-muted' : 'bg-zinc-800',
            )}>
                {!isPreviewDialogOpen && (
                    <Video className="h-full w-full" expandable expandBadge onExpandChange={setIsExpanded} />
                )}
            </div>

            {/* speed — bottom-left, standing */}
            <button
                type="button"
                onPointerDown={onPressStart}
                onPointerUp={stopPress}
                onPointerLeave={stopPress}
                onClick={onBadgeClick}
                onContextMenu={e => { e.preventDefault(); setMenuOpen(true); }}
                title={t('playbackSpeed')}
                // The badge's own text is the speed; a bare label would replace
                // it, and the reader would never hear which speed is in force.
                aria-label={t('playbackSpeedValue', { speed: formatSpeed(speed) })}
                className={cn(
                    'absolute bottom-[3px] left-[3px] z-10 flex h-4 items-center rounded px-[5px] text-[9.5px] font-extrabold tabular-nums text-white',
                    sameSpeed(speed, 1) ? 'bg-foreground/70' : 'bg-[hsl(var(--orange-deep))]',
                )}
            >
                {formatSpeed(speed)}
            </button>

            {menuOpen && (
                <div className="absolute bottom-[calc(100%+6px)] left-0 z-30 w-24 overflow-hidden rounded-[10px] border-2 border-border bg-card shadow-lg">
                    {SPEED_MENU.map(value => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => { setSpeed(value); setMenuOpen(false); }}
                            aria-current={sameSpeed(value, speed)}
                            className={cn(
                                'flex w-full items-center justify-between px-3 py-2 text-[13px] tabular-nums hover:bg-muted',
                                sameSpeed(value, speed) && 'bg-muted font-extrabold',
                            )}
                        >
                            {formatSpeed(value)}
                            {sameSpeed(value, speed) && <span className="text-[hsl(var(--orange-deep))]" aria-hidden>✓</span>}
                        </button>
                    ))}
                </div>
            )}

        </div>
    );
}
