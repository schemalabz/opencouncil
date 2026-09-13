'use client';

import { useEffect } from 'react';
import confetti from 'canvas-confetti';

/** The brand's oranges, with white to give the burst some air. */
const COLORS = ['#c24e00', '#f97316', '#fbbf24', '#ffffff'];

/**
 * One burst of confetti from each side of the screen, as a completion
 * screen appears. A signup is the end of a minute's work for the reader,
 * and the check alone is a quiet way to say so. Nothing under reduced
 * motion, and the canvas leaves with the screen.
 */
export function useCelebration() {
    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const burst = (angle: number, x: number) =>
            confetti({ particleCount: 70, angle, spread: 60, startVelocity: 45, origin: { x, y: 0.7 }, colors: COLORS, ticks: 220, scalar: 0.9 });
        burst(60, 0.05);
        burst(120, 0.95);
        return () => {
            confetti.reset();
        };
    }, []);
}
