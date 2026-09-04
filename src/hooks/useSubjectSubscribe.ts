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

type ExistingLocation = { id: string; text: string; coordinates: [number, number] };

/**
 * Locations no longer round-trip by id: saveNotificationPreferences creates a fresh
 * Location row per save, so a subscribed location is a *copy* of the subject's
 * location with a different id. Match on id first (pre-existing rows) and fall back
 * to the text, which the copy preserves.
 */
function sameLocation(a: { id: string; text: string }, b: { id: string; text: string }): boolean {
    return a.id === b.id || a.text === b.text;
}

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
    // Full location rows, not just ids: saveNotificationPreferences now recreates
    // Location rows server-side from raw {text, coordinates}, so we must be able to
    // resend the ones we want to keep.
    const [existingLocations, setExistingLocations] = useState<ExistingLocation[]>([]);
    const [hasAnyPreferences, setHasAnyPreferences] = useState(false);
    const [hasOtherCityPreferences, setHasOtherCityPreferences] = useState(false);
    const [prefsLoaded, setPrefsLoaded] = useState(false);

    const notificationsPageUrl = `/${cityId}/notifications`;

    const isTopicSubscribed = prefsLoaded && isAuthenticated && !!topic && existingTopicIds.includes(topic.id);
    const isLocationSubscribed = prefsLoaded && isAuthenticated && !!location
        && existingLocations.some(l => sameLocation(l, location));

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
                setExistingLocations(cityPref ? (cityPref.locations || []) as ExistingLocation[] : []);
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
                    setExistingLocations([]);
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
                let mergedLocations = [...existingLocations];
                if (location) {
                    const present = mergedLocations.some(l => sameLocation(l, location));
                    if (locationChecked && !present && location.coordinates) {
                        mergedLocations.push({
                            id: location.id,
                            text: location.text,
                            coordinates: [location.coordinates.x, location.coordinates.y],
                        });
                    } else if (!locationChecked && present) {
                        mergedLocations = mergedLocations.filter(l => !sameLocation(l, location));
                    }
                }

                const result = await saveNotificationPreferences({
                    cityId,
                    topicIds: mergedTopicIds,
                    // Locations are recreated server-side from their raw data, so send
                    // text + coordinates for every location we want to keep.
                    locations: mergedLocations.map(l => ({ text: l.text, coordinates: l.coordinates })),
                    // This is the only caller allowed to wipe a user's preferences
                    // (when the user deselects every topic and location in the popover).
                    allowUnsubscribeAll: true,
                });

                if (result.success) {
                    // Update raw pref arrays; alreadySubscribed derives automatically next render
                    setExistingTopicIds(mergedTopicIds);
                    setExistingLocations(mergedLocations);
                    setHasAnyPreferences(mergedTopicIds.length > 0 || mergedLocations.length > 0 || hasOtherCityPreferences);
                    return true;
                }
                return false;
            } catch {
                return false;
            } finally {
                setIsSaving(false);
            }
        },
        [isAuthenticated, isLoading, isSaving, prefsLoaded, cityId, existingTopicIds, existingLocations, topic, location, hasOtherCityPreferences]
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
