"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { getUserPreferences, saveNotificationPreferences } from "@/lib/db/notifications";
import type { Topic } from "@prisma/client";

export type SubjectLocation = {
    id: string;
    text: string;
    coordinates?: { x: number; y: number } | null;
} | null;

export type SubjectTopic = Pick<Topic, "id" | "name" | "name_en" | "colorHex" | "icon"> | null;

export type UseSubjectSubscribeOptions = {
    topic: SubjectTopic;
    location: SubjectLocation;
    cityId: string;
};

export type UseSubjectSubscribeResult = {
    isAuthenticated: boolean;
    alreadySubscribed: boolean;
    hasAnyPreferences: boolean;
    isTopicSubscribed: boolean;
    isLocationSubscribed: boolean;
    isLoading: boolean;
    isSaving: boolean;
    save: (topicChecked: boolean, locationChecked: boolean) => Promise<boolean>;
    notificationsPageUrl: string;
};

/**
 * Hook for subscribing to notifications for a subject's topic and/or location.
 * Handles three user states: unauthenticated, authenticated with no prefs, authenticated with existing prefs.
 * Performs proper merge to avoid dropping existing subscriptions.
 */
export function useSubjectSubscribe({
    topic,
    location,
    cityId,
}: UseSubjectSubscribeOptions): UseSubjectSubscribeResult {
    const { data: session, status } = useSession();
    const isAuthenticated = status === "authenticated" && !!session?.user;

    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Raw preference data fetched from server
    const [existingTopicIds, setExistingTopicIds] = useState<string[]>([]);
    const [existingLocationIds, setExistingLocationIds] = useState<string[]>([]);
    const [hasAnyPreferences, setHasAnyPreferences] = useState(false);
    const [hasOtherCityPreferences, setHasOtherCityPreferences] = useState(false);
    const [prefsLoaded, setPrefsLoaded] = useState(false);

    const notificationsPageUrl = `/${cityId}/notifications`;

    const isTopicSubscribed = prefsLoaded && isAuthenticated && !!topic && existingTopicIds.includes(topic.id);
    const isLocationSubscribed = prefsLoaded && isAuthenticated && !!location && existingLocationIds.includes(location.id);

    // rerender-derived-state-no-effect: derive during render, no extra state
    const alreadySubscribed =
        prefsLoaded &&
        isAuthenticated &&
        (topic ? isTopicSubscribed : true) &&
        (location ? isLocationSubscribed : true) &&
        (!!topic || !!location);

    useEffect(() => {
        if (!isAuthenticated || (!topic && !location)) {
            setIsLoading(false);
            setPrefsLoaded(false);
            return;
        }

        let cancelled = false;
        setIsLoading(true);
        setPrefsLoaded(false);

        getUserPreferences()
            .then((prefs) => {
                if (cancelled) return;

                const cityPref = prefs.find(
                    (p) => p.cityId === cityId && !p.isPetition
                );

                setExistingTopicIds(cityPref ? (cityPref.topics || []).map((t) => t.id) : []);
                setExistingLocationIds(cityPref ? (cityPref.locations || []).map((l) => l.id) : []);
                const hasOtherCity = prefs.some(
                    p => p.cityId !== cityId && !p.isPetition &&
                        ((p.topics || []).length > 0 || (p.locations || []).length > 0)
                );
                setHasOtherCityPreferences(hasOtherCity);
                const hasAny = hasOtherCity || (cityPref?.topics || []).length > 0 || (cityPref?.locations || []).length > 0;
                setHasAnyPreferences(hasAny);
                setPrefsLoaded(true);
            })
            .catch(() => {
                if (!cancelled) {
                    setExistingTopicIds([]);
                    setExistingLocationIds([]);
                    setHasAnyPreferences(false);
                    setHasOtherCityPreferences(false);
                    setPrefsLoaded(true);
                }
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, topic?.id, location?.id, cityId]);

    /**
     * Updates the current topic and location subscriptions based on checkbox state.
     * Only affects the topic/location of the current subject, preserving other subscriptions in the city.
     * Returns true on success, false on failure.
     */
    const save = useCallback(
        async (topicChecked: boolean, locationChecked: boolean): Promise<boolean> => {
            if (!isAuthenticated || isLoading || isSaving || !prefsLoaded) return false;

            setIsSaving(true);
            try {
                // Topic logic: Add if checked and missing. Remove if unchecked and present.
                let mergedTopicIds = [...existingTopicIds];
                if (topic) {
                    if (topicChecked && !mergedTopicIds.includes(topic.id)) {
                        mergedTopicIds.push(topic.id);
                    } else if (!topicChecked && mergedTopicIds.includes(topic.id)) {
                        mergedTopicIds = mergedTopicIds.filter(id => id !== topic.id);
                    }
                }

                // Location logic: Add if checked and missing. Remove if unchecked and present.
                let mergedLocationIds = [...existingLocationIds];
                if (location) {
                    if (locationChecked && !mergedLocationIds.includes(location.id)) {
                        mergedLocationIds.push(location.id);
                    } else if (!locationChecked && mergedLocationIds.includes(location.id)) {
                        mergedLocationIds = mergedLocationIds.filter(id => id !== location.id);
                    }
                }

                const result = await saveNotificationPreferences({
                    cityId,
                    topicIds: mergedTopicIds,
                    locationIds: mergedLocationIds,
                });

                if (result.success) {
                    // Update raw pref arrays; alreadySubscribed derives automatically next render
                    setExistingTopicIds(mergedTopicIds);
                    setExistingLocationIds(mergedLocationIds);
                    setHasAnyPreferences(mergedTopicIds.length > 0 || mergedLocationIds.length > 0 || hasOtherCityPreferences);
                    return true;
                }
                return false;
            } catch {
                return false;
            } finally {
                setIsSaving(false);
            }
        },
        [isAuthenticated, isLoading, isSaving, prefsLoaded, cityId, existingTopicIds, existingLocationIds, topic, location, hasOtherCityPreferences]
    );

    return {
        isAuthenticated,
        alreadySubscribed,
        hasAnyPreferences,
        isTopicSubscribed,
        isLocationSubscribed,
        isLoading,
        isSaving,
        save,
        notificationsPageUrl,
    };
}
