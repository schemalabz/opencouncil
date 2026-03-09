import { useState, useEffect } from 'react';

/**
 * Hook to manage first-time visit detection using localStorage
 * Prevents hydration errors by deferring state initialization to client-side
 * @param storageKey - Unique key to store the visited state
 * @returns showExplainer state and setter
 */
export function useFirstVisit(storageKey: string) {
    const [showExplainer, setShowExplainer] = useState(false);
    const [isClient, setIsClient] = useState(false);

    // First effect: detect client-side mounting
    useEffect(() => {
        setIsClient(true);
    }, []);

    // Second effect: check localStorage only after client mount
    useEffect(() => {
        if (!isClient) return;

        const hasVisited = localStorage.getItem(storageKey);
        if (!hasVisited) {
            setShowExplainer(true);
        }
    }, [storageKey, isClient]);

    // Override setShowExplainer to also persist to localStorage
    const setShowExplainerAndPersist = (show: boolean) => {
        setShowExplainer(show);
        if (!show && typeof window !== 'undefined') {
            localStorage.setItem(storageKey, 'true');
        }
    };

    return {
        showExplainer,
        setShowExplainer: setShowExplainerAndPersist
    };
}
