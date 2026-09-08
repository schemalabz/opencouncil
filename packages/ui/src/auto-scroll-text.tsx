"use client";

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { cn } from './lib/utils';

interface AutoScrollTextProps {
    children: React.ReactNode;
    className?: string;
    /**
     * Duration of one scroll, each way, in seconds
     * @default 3
     */
    scrollDuration?: number;
    /**
     * Pause at each end in seconds
     * @default 1.5
     */
    pauseDuration?: number;
}

interface Overflow {
    /** How far the text has to travel, in px. */
    distance: number;
    /** The animation delay that puts this instance on the page's shared clock, in ms. */
    phase: number;
}

/**
 * Text that scrolls back and forth when it does not fit, the way a music
 * player shows a long title.
 *
 * Every instance on a page runs on one clock: the animation's delay is set
 * back to the last shared period boundary, so a meeting name and a subject
 * name under it start, turn and rest together however far apart they mounted.
 *
 * The cut edge fades, and the fade travels with the cut. A mask on the
 * container runs on the same clock as the text: while the text rests at its
 * start only the far edge fades, while it moves both do, while it rests at
 * the end only the near edge — so a resting first letter is never
 * half-transparent, and a moving one never ends in a hard line beside an
 * icon.
 */
export function AutoScrollText({
    children,
    className,
    scrollDuration = 3,
    pauseDuration = 1.5,
}: AutoScrollTextProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);
    const [overflow, setOverflow] = useState<Overflow | null>(null);
    const totalDuration = scrollDuration * 2 + pauseDuration * 2;

    useEffect(() => {
        const container = containerRef.current;
        const text = textRef.current;
        if (!container || !text) return;
        let frame = 0;
        const check = () => {
            cancelAnimationFrame(frame);
            // Measured and phased in a frame: the frame's time is the document
            // timeline the animation starts on, so instances that start in
            // different frames still share the period boundaries. Date.now() at
            // effect time put siblings a quarter second apart.
            frame = requestAnimationFrame(frameTime => {
                const distance = text.scrollWidth - container.offsetWidth;
                if (distance <= 0) {
                    setOverflow(null);
                    return;
                }
                const periodMs = totalDuration * 1000;
                setOverflow(previous => {
                    if (previous?.distance === distance) return previous;
                    // A running animation keeps its delay: a rewritten delay applies
                    // to the preserved start time and throws the instance off the clock.
                    return { distance, phase: previous ? previous.phase : -(frameTime % periodMs) };
                });
            });
        };

        check();
        // The container, not the window: the meeting sidebar collapses and the
        // header's stage chip comes and goes with no resize event.
        const observer = new ResizeObserver(check);
        observer.observe(container);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [children, totalDuration]);

    const timing: CSSProperties | undefined = overflow
        ? {
            animationDuration: `${totalDuration}s`,
            animationDelay: `${overflow.phase}ms`,
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
        }
        : undefined;

    return (
        <div
            ref={containerRef}
            className={cn('relative overflow-hidden motion-reduce:animate-none', overflow && 'animate-auto-scroll-mask', className)}
            style={timing}
        >
            <div
                ref={textRef}
                className={cn(
                    'inline-block whitespace-nowrap',
                    overflow && 'animate-auto-scroll',
                    // With reduced motion the text stands still and ends in an ellipsis.
                    'motion-reduce:block motion-reduce:animate-none motion-reduce:truncate',
                )}
                style={overflow ? ({ ...timing, '--scroll-distance': `-${overflow.distance}px` } as CSSProperties) : undefined}
            >
                {children}
            </div>
        </div>
    );
}
