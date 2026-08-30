'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Renders its children only once the wrapper has scrolled near the viewport.
 * For decorations that are expensive to mount — a live map in a side rail —
 * where the old behaviour (nothing until the user gets there) is the right
 * cost model. The wrapper carries the box so nothing shifts when the real
 * content lands; environments without IntersectionObserver mount immediately.
 */
export function MountOnVisible({ children, className }: {
    children: React.ReactNode;
    className?: string;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el || visible) return;
        if (typeof IntersectionObserver === 'undefined') {
            setVisible(true);
            return;
        }
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                setVisible(true);
                observer.disconnect();
            }
        }, { rootMargin: '200px' });
        observer.observe(el);
        return () => observer.disconnect();
    }, [visible]);

    return <div ref={ref} className={className}>{visible ? children : null}</div>;
}
