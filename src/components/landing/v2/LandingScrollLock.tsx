'use client';

import { useEffect } from 'react';

/* The root layout's min-h-screen (100vh) exceeds the 100dvh landing on mobile (100vh is the
   large viewport), leaving a strip of real scroll. Lock html/body to the dynamic viewport
   while the immersive landing is mounted. */
export function LandingScrollLock() {
    useEffect(() => {
        document.documentElement.classList.add('landing-scroll-lock');
        document.body.classList.add('landing-scroll-lock');
        return () => {
            document.documentElement.classList.remove('landing-scroll-lock');
            document.body.classList.remove('landing-scroll-lock');
        };
    }, []);

    return null;
}
