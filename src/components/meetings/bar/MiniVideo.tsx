"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Video } from '@/components/meetings/Video';
import { useVideo } from '@/components/meetings/VideoProvider';
import { useHighlight } from '@/components/meetings/HighlightContext';
import { useTranscriptOptions } from '@/components/meetings/options/OptionsContext';
import { cn } from '@/lib/utils';

const CYCLE = [1, 1.25, 1.5, 2];
const MENU = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const LONG_PRESS_MS = 450;

/**
 * The dock's video: the thumbnail with its two standing affordances — the
 * expand badge (bottom-right, no hover needed) and the speed badge
 * (bottom-left: click cycles, long press opens the menu, lit when ≠1×).
 */
export function MiniVideo({ compact = false }: { compact?: boolean }) {
    const t = useTranslations('transcript.controls');
    const { options, updateOptions } = useTranscriptOptions();
    const { handleSpeedChange } = useVideo();
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

    const cycleSpeed = () => {
        const idx = CYCLE.findIndex(v => Math.abs(v - speed) < 0.01);
        setSpeed(CYCLE[(idx + 1) % CYCLE.length] ?? CYCLE[0]);
    };

    const onPressStart = () => {
        longPressed.current = false;
        pressTimer.current = setTimeout(() => {
            longPressed.current = true;
            setMenuOpen(true);
        }, LONG_PRESS_MS);
    };
    const onPressEnd = () => {
        if (pressTimer.current) clearTimeout(pressTimer.current);
        if (!longPressed.current && !menuOpen) cycleSpeed();
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

    const size = compact ? 'h-[42px] w-[70px]' : 'h-[62px] w-[110px]';

    return (
        <div ref={wrapRef} className={cn('relative shrink-0', size)}>
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
                onPointerUp={onPressEnd}
                onPointerLeave={() => pressTimer.current && clearTimeout(pressTimer.current)}
                onContextMenu={e => { e.preventDefault(); setMenuOpen(true); }}
                title={t('playbackSpeed')}
                aria-label={t('playbackSpeed')}
                className={cn(
                    'absolute bottom-[3px] left-[3px] z-10 flex h-4 items-center rounded px-[5px] text-[9.5px] font-extrabold tabular-nums text-white',
                    Math.abs(speed - 1) < 0.01 ? 'bg-foreground/70' : 'bg-[hsl(var(--orange-deep))]',
                )}
            >
                {formatSpeed(speed)}
            </button>

            {menuOpen && (
                <div className="absolute bottom-[calc(100%+6px)] left-0 z-30 w-24 overflow-hidden rounded-[10px] border-2 border-border bg-card shadow-lg">
                    {MENU.map(value => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => { setSpeed(value); setMenuOpen(false); }}
                            className={cn(
                                'flex w-full items-center justify-between px-3 py-2 text-[13px] tabular-nums hover:bg-muted',
                                Math.abs(value - speed) < 0.01 && 'bg-muted font-extrabold',
                            )}
                        >
                            {formatSpeed(value)}
                            {Math.abs(value - speed) < 0.01 && <span className="text-[hsl(var(--orange-deep))]">✓</span>}
                        </button>
                    ))}
                </div>
            )}

        </div>
    );
}

function formatSpeed(value: number): string {
    return `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}×`;
}
