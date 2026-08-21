'use client';

import { useEffect } from 'react';

/**
 * Stops the page behind a full-screen overlay from scrolling while `active`.
 *
 * Without it a modal layer such as the /search mobile filter panel leaves the
 * results list scrolling underneath, and on iOS Safari the whole page
 * rubber-bands when the panel's own scroller reaches its end — so closing the
 * panel drops the user somewhere they never navigated to.
 *
 * The class only touches overflow, so the page below keeps its scroll position.
 * `LandingScrollLock` has a separate class because it also has to pin html/body
 * to the dynamic viewport for the 100dvh landing.
 */
export function useBodyScrollLock(active: boolean) {
    useEffect(() => {
        if (!active) return;
        document.documentElement.classList.add('overlay-scroll-lock');
        document.body.classList.add('overlay-scroll-lock');
        return () => {
            document.documentElement.classList.remove('overlay-scroll-lock');
            document.body.classList.remove('overlay-scroll-lock');
        };
    }, [active]);
}
