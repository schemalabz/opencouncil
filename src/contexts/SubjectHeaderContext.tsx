"use client";

import React, { createContext, useCallback, useContext, useState } from 'react';

export interface SubjectHeaderInfo {
    name: string;
    topicIcon?: string;
    topicColor?: string;
    topicName?: string;
    agendaItemIndex?: number;
    nonAgendaReason?: string;
    heroVisible: boolean;
}

interface SubjectHeaderContextValue {
    subjectHeader: SubjectHeaderInfo | null;
    setSubjectHeader: (info: SubjectHeaderInfo | null) => void;
    setHeroVisible: (visible: boolean) => void;
}

const SubjectHeaderContext = createContext<SubjectHeaderContextValue | undefined>(undefined);

export function SubjectHeaderProvider({ children }: { children: React.ReactNode }) {
    const [subjectHeader, setSubjectHeader] = useState<SubjectHeaderInfo | null>(null);

    const setHeroVisible = useCallback((visible: boolean) => {
        setSubjectHeader(prev => prev ? { ...prev, heroVisible: visible } : prev);
    }, []);

    return (
        <SubjectHeaderContext.Provider value={{ subjectHeader, setSubjectHeader, setHeroVisible }}>
            {children}
        </SubjectHeaderContext.Provider>
    );
}

export function useSubjectHeader() {
    const context = useContext(SubjectHeaderContext);
    if (context === undefined) {
        throw new Error('useSubjectHeader must be used within a SubjectHeaderProvider');
    }
    return context;
}

export function useSubjectHeaderOptional() {
    return useContext(SubjectHeaderContext);
}
