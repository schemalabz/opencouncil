'use client';

import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
    // Initialize with false for SSR
    const [matches, setMatches] = useState(false);

    useEffect(() => {
        // Create a MediaQueryList object
        const media = window.matchMedia(query);

        // Initial check
        setMatches(media.matches);

        // Callback function to update state
        const listener = (event: MediaQueryListEvent) => {
            setMatches(event.matches);
        };

        // Add listener for changes
        media.addEventListener('change', listener);

        // Cleanup
        return () => {
            media.removeEventListener('change', listener);
        };
    }, [query]);

    return matches;
} 