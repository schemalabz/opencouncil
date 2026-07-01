'use client';

import { useEffect } from 'react';

/* The root layout gives <body> min-h-screen (100vh). On mobile browsers 100vh is the
   large viewport (browser chrome collapsed), so the document ends up taller than the
   100dvh landing and the page gets a strip of real scroll. Lock html/body to the
   dynamic viewport while the immersive landing is mounted. */
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
