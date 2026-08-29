"use server";

import {
    getUserPreferences as getUserPreferencesInternal,
    saveNotificationPreferences as saveNotificationPreferencesInternal,
    savePetition as savePetitionInternal,
} from "@/lib/db/notifications";

/** Return the signed-in user's onboarding preferences. */
export async function getUserPreferences() {
    return getUserPreferencesInternal();
}

/** Save the public notification signup form after server-side validation. */
export async function saveNotificationPreferences(
    data: Parameters<typeof saveNotificationPreferencesInternal>[0],
) {
    return saveNotificationPreferencesInternal(data);
}

/** Save the public petition form after server-side validation. */
export async function savePetition(
    data: Parameters<typeof savePetitionInternal>[0],
) {
    return savePetitionInternal(data);
}
