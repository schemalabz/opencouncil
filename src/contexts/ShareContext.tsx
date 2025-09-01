"use client";

import React, { createContext, useContext, useState, useCallback } from 'react';

interface ShareContextValue {
    isOpen: boolean;
    targetTimestamp: number | null;
    shouldTriggerCopy: boolean;
    openShareDropdown: (timestamp?: number) => void;
    openShareDropdownAndCopy: (timestamp: number) => void;
    closeShareDropdown: () => void;
    resetCopyTrigger: () => void;
}

const ShareContext = createContext<ShareContextValue | undefined>(undefined);

export function ShareProvider({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [targetTimestamp, setTargetTimestamp] = useState<number | null>(null);
    const [shouldTriggerCopy, setShouldTriggerCopy] = useState(false);

    const openShareDropdown = useCallback((timestamp?: number) => {
        setTargetTimestamp(timestamp ?? null);
        setIsOpen(true);
        setShouldTriggerCopy(false);
    }, []);

    const openShareDropdownAndCopy = useCallback((timestamp: number) => {
        setTargetTimestamp(timestamp);
        setIsOpen(true);
        setShouldTriggerCopy(true);
    }, []);

    const closeShareDropdown = useCallback(() => {
        setIsOpen(false);
        setTargetTimestamp(null);
        setShouldTriggerCopy(false);
    }, []);

    const resetCopyTrigger = useCallback(() => {
        setShouldTriggerCopy(false);
    }, []);

    const value: ShareContextValue = {
        isOpen,
        targetTimestamp,
        shouldTriggerCopy,
        openShareDropdown,
        openShareDropdownAndCopy,
        closeShareDropdown,
        resetCopyTrigger
    };

    return (
        <ShareContext.Provider value={value}>
            {children}
        </ShareContext.Provider>
    );
}

export function useShare() {
    const context = useContext(ShareContext);
    if (context === undefined) {
        throw new Error('useShare must be used within a ShareProvider');
    }
    return context;
}
