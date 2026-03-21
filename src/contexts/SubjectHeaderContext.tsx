"use client";

import React, { createContext, useContext, useState } from 'react';

export interface SubjectHeaderInfo {
    name: string;
    topicIcon?: string;
    topicColor?: string;
}

interface SubjectHeaderContextValue {
    subjectHeader: SubjectHeaderInfo | null;
    setSubjectHeader: (info: SubjectHeaderInfo | null) => void;
}

const SubjectHeaderContext = createContext<SubjectHeaderContextValue | undefined>(undefined);

export function SubjectHeaderProvider({ children }: { children: React.ReactNode }) {
    const [subjectHeader, setSubjectHeader] = useState<SubjectHeaderInfo | null>(null);

    return (
        <SubjectHeaderContext.Provider value={{ subjectHeader, setSubjectHeader }}>
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
