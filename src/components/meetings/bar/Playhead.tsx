"use client";

import React, { useEffect, useRef } from 'react';
import { formatTimestamp } from '@/lib/utils';

/**
 * The playhead: a rAF loop reading the video element directly and writing a
 * transform — no React state, no 2-second jumps. The lens mounts a second one
 * over its track with `announce` off: the strip's slider is the one that speaks.
 */
export function Playhead({ playerRef, currentTimeRef, duration, barRef, isPlaying, pausedTick, announce = true }: {
    playerRef: React.MutableRefObject<HTMLVideoElement | null>;
    currentTimeRef: React.MutableRefObject<number>;
    duration: number;
    barRef: React.RefObject<HTMLDivElement | null>;
    isPlaying: boolean;
    /** the throttled clock — its changes reposition the paused playhead after seeks */
    pausedTick: number;
    /** whether this playhead maintains the slider's aria values on `barRef` */
    announce?: boolean;
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
            if (!announce) return;
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
    }, [duration, playerRef, currentTimeRef, barRef, isPlaying, pausedTick, announce]);

    return (
        <div ref={headRef} aria-hidden className="pointer-events-none absolute left-0 top-0 h-full" style={{ zIndex: 11 }}>
            <div className="h-full w-[2px] -translate-x-1/2 bg-slate-700" />
            <div className="absolute left-0 top-[1px] h-[9px] w-[9px] -translate-x-1/2 rounded-full bg-slate-700" />
        </div>
    );
}
