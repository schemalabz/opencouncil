"use server";

import { calculateProximityMatches } from '@/lib/db/notifications';

interface Subject {
    id: string;
    topicId: string | null;
    locationId: string | null;
}

interface UserPreference {
    userId: string;
    locations: { id: string }[];
    interests: { id: string }[];
}

interface SubjectImportance {
    topicImportance: 'doNotNotify' | 'normal' | 'high';
    proximityImportance: 'none' | 'near' | 'wide';
}

interface SubjectMatch {
    subjectId: string;
    reason: 'proximity' | 'topic' | 'generalInterest';
}

/**
 * Match users to subjects based on importance levels and user preferences
 * Returns a map of userId -> Set of matched subjects with reasons
 */
export async function matchUsersToSubjects(
    subjects: Subject[],
    usersWithPreferences: UserPreference[],
    subjectImportanceOverrides?: Record<string, SubjectImportance>
): Promise<Map<string, Set<SubjectMatch>>> {
    const userSubjectMatches = new Map<string, Set<SubjectMatch>>();

    // Process each subject
    for (const subject of subjects) {
        // Determine importance levels
        const topicImportance = subjectImportanceOverrides?.[subject.id]?.topicImportance || 'doNotNotify';
        const proximityImportance = subjectImportanceOverrides?.[subject.id]?.proximityImportance || 'none';

        // Skip if both are disabled
        if (topicImportance === 'doNotNotify' && proximityImportance === 'none') {
            continue;
        }

        // Check each user against this subject
        for (const userPref of usersWithPreferences) {
            const userId = userPref.userId;

            // Initialize set for this user if not exists
            if (!userSubjectMatches.has(userId)) {
                userSubjectMatches.set(userId, new Set());
            }

            const matches = userSubjectMatches.get(userId)!;

            // Rule 1: High importance - notify everyone
            if (topicImportance === 'high') {
                matches.add({ subjectId: subject.id, reason: 'generalInterest' });
                continue;
            }

            // Rule 2: Normal topic importance + user is interested in the topic
            if (topicImportance === 'normal' && subject.topicId) {
                const isInterestedInTopic = userPref.interests.some(t => t.id === subject.topicId);
                if (isInterestedInTopic) {
                    matches.add({ subjectId: subject.id, reason: 'topic' });
                    continue;
                }
            }

            // Rule 3 & 4: Proximity-based matching
            if (proximityImportance !== 'none' && subject.locationId && userPref.locations.length > 0) {
                const distanceMeters = proximityImportance === 'near' ? 250 : 1000; // near=250m, wide=1000m
                const userLocationIds = userPref.locations.map(l => l.id);

                const isNearby = await calculateProximityMatches(
                    userLocationIds,
                    subject.locationId,
                    distanceMeters
                );

                if (isNearby) {
                    matches.add({ subjectId: subject.id, reason: 'proximity' });
                }
            }
        }
    }

    return userSubjectMatches;
}

/**
 * Calculate notification impact - how many users will be notified for each subject
 * Returns total unique users and per-subject impact counts
 */
export async function calculateNotificationImpact(
    subjects: Subject[],
    usersWithPreferences: UserPreference[],
    subjectImportanceOverrides?: Record<string, SubjectImportance>
): Promise<{
    totalUsers: number;
    subjectImpact: Record<string, number>;
}> {
    const userSubjectMatches = await matchUsersToSubjects(subjects, usersWithPreferences, subjectImportanceOverrides);

    // Track user counts for each subject
    const subjectImpact = new Map<string, number>();
    const totalUniqueUsers = new Set<string>();

    // Count matches per subject
    for (const [userId, matches] of userSubjectMatches.entries()) {
        totalUniqueUsers.add(userId);
        for (const match of matches) {
            const currentCount = subjectImpact.get(match.subjectId) || 0;
            subjectImpact.set(match.subjectId, currentCount + 1);
        }
    }

    return {
        totalUsers: totalUniqueUsers.size,
        subjectImpact: Object.fromEntries(subjectImpact)
    };
}

