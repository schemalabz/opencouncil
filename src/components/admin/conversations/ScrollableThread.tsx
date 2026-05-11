'use client';

import { Children, useEffect, useRef, type ReactNode } from 'react';

export function ScrollableThread({ children }: { children: ReactNode }) {
    const ref = useRef<HTMLOListElement>(null);
    // The component itself doesn't remount across an RSC refresh, so an
    // empty-deps effect would only fire once on first mount.
    const count = Children.count(children);

    useEffect(() => {
        const el = ref.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [count]);

    return (
        <ol
            ref={ref}
            className="flex flex-col gap-3 max-h-80 overflow-y-auto pr-2"
        >
            {children}
        </ol>
    );
}
