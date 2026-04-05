"use client";

import React, { createContext, useContext } from 'react';
import { CityNotificationPreference } from '@/lib/db/notifications';

type NotificationPreferenceContextValue = {
    notificationPreference: CityNotificationPreference | null;
};

const NotificationPreferenceContext = createContext<NotificationPreferenceContextValue | undefined>(undefined);

export function NotificationPreferenceProvider({
    children,
    notificationPreference
}: {
    children: React.ReactNode;
    notificationPreference: CityNotificationPreference | null;
}) {
    return (
        <NotificationPreferenceContext.Provider value={{ notificationPreference }}>
            {children}
        </NotificationPreferenceContext.Provider>
    );
}

export function useNotificationPreference() {
    const context = useContext(NotificationPreferenceContext);
    if (context === undefined) {
        throw new Error('useNotificationPreference must be used within a NotificationPreferenceProvider');
    }
    return context.notificationPreference;
}
