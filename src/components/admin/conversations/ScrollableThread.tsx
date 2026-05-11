'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function ScrollableThread({ children }: { children: ReactNode }) {
    const ref = useRef<HTMLOListElement>(null);

    // Plain useEffect (not useLayoutEffect) — this component renders inside
    // a server component, and useLayoutEffect triggers a React SSR warning
    // because it has no server-side equivalent. We're only setting scrollTop
    // here, not measuring layout, so post-paint timing is fine.
    useEffect(() => {
        const el = ref.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, []);

    return (
        <ol
            ref={ref}
            className="flex flex-col gap-3 max-h-80 overflow-y-auto pr-2"
        >
            {children}
        </ol>
    );
}
