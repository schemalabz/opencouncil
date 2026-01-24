"use client";

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface AutoScrollTextProps {
    children: React.ReactNode;
    className?: string;
    /**
     * Duration of the scroll animation in seconds
     * @default 3
     */
    scrollDuration?: number;
    /**
     * Pause duration at each end in seconds
     * @default 1.5
     */
    pauseDuration?: number;
}

export function AutoScrollText({
    children,
    className,
    scrollDuration = 3,
    pauseDuration = 1.5,
}: AutoScrollTextProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const [scrollDistance, setScrollDistance] = useState(0);

    useEffect(() => {
        const checkOverflow = () => {
            if (containerRef.current && textRef.current) {
                const containerWidth = containerRef.current.offsetWidth;
                const textWidth = textRef.current.scrollWidth;
                const overflowing = textWidth > containerWidth;

                setIsOverflowing(overflowing);
                if (overflowing) {
                    // Calculate how far we need to scroll
                    setScrollDistance(textWidth - containerWidth);
                }
            }
        };

        checkOverflow();

        // Re-check on window resize
        window.addEventListener('resize', checkOverflow);
        return () => window.removeEventListener('resize', checkOverflow);
    }, [children]);

    // Calculate total animation duration
    const totalDuration = isOverflowing
        ? scrollDuration * 2 + pauseDuration * 2
        : 0;

    return (
        <div
            ref={containerRef}
            className={cn("overflow-hidden relative", className)}
        >
            <div
                ref={textRef}
                className={cn(
                    "whitespace-nowrap inline-block",
                    isOverflowing && "animate-auto-scroll"
                )}
                style={
                    isOverflowing
                        ? {
                              animationDuration: `${totalDuration}s`,
                              animationTimingFunction: 'linear',
                              animationIterationCount: 'infinite',
                              '--scroll-distance': `-${scrollDistance}px`,
                              '--scroll-duration': `${scrollDuration}s`,
                              '--pause-duration': `${pauseDuration}s`,
                          } as React.CSSProperties
                        : undefined
                }
            >
                {children}
            </div>
        </div>
    );
}
