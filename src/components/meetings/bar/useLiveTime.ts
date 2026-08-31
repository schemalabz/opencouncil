import { useEffect, useState } from 'react';

/**
 * The playback position at clock cadence. The provider's context state is
 * throttled to ~2s for cheap re-renders everywhere else; the few leaves that
 * read like a clock (the time bubble, the now line) poll the ref instead.
 */
export function useLiveTime(ref: React.MutableRefObject<number>, intervalMs = 500): number {
    const [time, setTime] = useState(() => ref.current);
    useEffect(() => {
        const id = setInterval(() => {
            const value = ref.current;
            setTime(prev => (Math.abs(prev - value) >= 0.5 ? value : prev));
        }, intervalMs);
        return () => clearInterval(id);
    }, [ref, intervalMs]);
    return time;
}
