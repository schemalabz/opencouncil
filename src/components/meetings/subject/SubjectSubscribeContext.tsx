"use client";
import { createContext, useContext } from "react";
import { useSubjectSubscribe, SubjectTopic, SubjectLocation, UseSubjectSubscribeResult } from "@/hooks/useSubjectSubscribe";

const SubjectSubscribeContext = createContext<UseSubjectSubscribeResult | null>(null);

export function SubjectSubscribeProvider({
    topic,
    location,
    cityId,
    children,
}: {
    topic: SubjectTopic;
    location: SubjectLocation;
    cityId: string;
    children: React.ReactNode;
}) {
    const subscribeState = useSubjectSubscribe({ topic, location, cityId });

    return (
        <SubjectSubscribeContext.Provider value={subscribeState}>
            {children}
        </SubjectSubscribeContext.Provider>
    );
}

export function useSubjectSubscribeContext() {
    const ctx = useContext(SubjectSubscribeContext);
    if (!ctx) throw new Error("useSubjectSubscribeContext must be used within SubjectSubscribeProvider");
    return ctx;
}
