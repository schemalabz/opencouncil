import { useEffect, useRef } from "react";

/**
 * Runs `onRestore` when the browser shows this page again out of its
 * back-forward cache. A page that left for another site (Google's sign-in)
 * comes back with its React state exactly as it was, so a "please wait" flag
 * set before leaving would stay on until a reload.
 */
export function useBfcacheRestore(onRestore: () => void) {
    const latest = useRef(onRestore);
    latest.current = onRestore;
    useEffect(() => {
        const onPageShow = (event: PageTransitionEvent) => {
            if (event.persisted) latest.current();
        };
        window.addEventListener("pageshow", onPageShow);
        return () => window.removeEventListener("pageshow", onPageShow);
    }, []);
}
