"use client";
import { createContext, useContext, useState, useCallback } from "react";
import { useSubjectSubscribe, SubjectTopic, SubjectLocation, UseSubjectSubscribeResult } from "@/hooks/useSubjectSubscribe";
import { isNudgeDismissed, setNudgeDismissed } from "./notificationNudgeDismissed";

type SubjectSubscribeContextValue = UseSubjectSubscribeResult & {
    isDismissed: boolean;
    dismiss: () => void;
};

const SubjectSubscribeContext = createContext<SubjectSubscribeContextValue | null>(null);

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

    const [isDismissed, setIsDismissed] = useState(() => isNudgeDismissed());
    const dismiss = useCallback(() => {
        setNudgeDismissed();
        setIsDismissed(true);
    }, []);

    return (
        <SubjectSubscribeContext.Provider value={{ ...subscribeState, isDismissed, dismiss }}>
            {children}
        </SubjectSubscribeContext.Provider>
    );
}

export function useSubjectSubscribeContext() {
    const ctx = useContext(SubjectSubscribeContext);
    if (!ctx) throw new Error("useSubjectSubscribeContext must be used within SubjectSubscribeProvider");
    return ctx;
}
