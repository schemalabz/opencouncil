import { useEffect, useState } from 'react';

/**
 * The playback position at clock cadence. The provider's context state is
 * throttled to ~2s for cheap re-renders everywhere else; the few leaves that
 * read like a clock (the time bubble, the now line) poll the ref instead.
 */
export function useLiveTime(ref: React.MutableRefObject<number>, running = true, intervalMs = 500): number {
    const [time, setTime] = useState(() => ref.current);
    useEffect(() => {
        // Paused, the position changes only through seeks, which re-render the
        // owner anyway — one sync read, no standing timer.
        if (!running) {
            setTime(ref.current);
            return;
        }
        const id = setInterval(() => {
            const value = ref.current;
            setTime(prev => (Math.abs(prev - value) >= 0.5 ? value : prev));
        }, intervalMs);
        return () => clearInterval(id);
    }, [ref, running, intervalMs]);
    return time;
}
