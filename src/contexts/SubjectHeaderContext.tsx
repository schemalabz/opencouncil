"use client";

import React, { createContext, useContext, useState } from 'react';

/** A neighbour the header can step to: where, and what to call it. */
export interface HeaderNeighbour {
    href: string;
    label: string;
}

export interface SubjectHeaderInfo {
    name: string;
    topicIcon?: string;
    topicColor?: string;
    /** The subject before this one in the meeting's order, or null at the start. */
    previous?: HeaderNeighbour | null;
    /** The subject after this one, or null at the end. */
    next?: HeaderNeighbour | null;
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
