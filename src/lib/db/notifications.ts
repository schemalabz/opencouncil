import "server-only";

import { NotificationPreference, Petition, City, Topic, User, Location, Prisma } from '@prisma/client';
import { auth, signIn } from "@/auth";
import { getCurrentUser, withUserAuthorizedToEdit } from "@/lib/auth";
import { classifyDeliveries, deliveriesWhereForStatus } from '@/lib/notifications/deliveryStatus';
import { attachGeometryToCities } from "./cities";
import prisma from "@/lib/db/prisma";
import { Result, createSuccess, createError } from "@/lib/result";
import { NotFoundError } from "@/lib/api/errors";
import { sendPetitionReceivedAdminAlert, sendUserOnboardedAdminAlert, sendNotificationSignupAdminAlert } from "@/lib/discord";
import { matchUsersToSubjects } from "@/lib/notifications/matching";
import { generateEmailContent, generateSmsContent } from "@/lib/notifications/content";
import { sendWelcomeMessages } from "@/lib/notifications/welcome";
import { IS_DEV } from "@/lib/utils";
import { saveNotificationPreferencesSchema, savePetitionSchema } from "@/lib/zod-schemas/onboarding";

// Type definitions for user preferences data
export type PetitionWithRelations = Petition & {
    city: City;
};

export type NotificationPreferenceWithRelations = NotificationPreference & {
    city: City;
    locations: Location[];
    interests: Topic[];
};

export type UserPreference = {
    cityId: string;
    city: City & { geometry?: any };
    isPetition: boolean;
    petitionData?: {
        name: string;
        isResident: boolean;
        isCitizen: boolean;
        phone?: string;
    };
    locations?: {
        id: string;
        text: string;
        coordinates: [number, number];
    }[];
    topics?: Topic[];
};

/**
 * Get server session wrapper
 */
async function getServerSession() {
    return await auth();
}

/**
 * Ownership guard for the userId-parameterised functions below.
 * A browser-facing action or route can supply an arbitrary userId.
 * Require the current session to own that id, or be a superadmin.
 * Do not use this guard for the token-authorised unsubscribe path.
 */
async function requireSelfOrSuperadmin(userId: string): Promise<void> {
    const actor = await getCurrentUser();
    if (!actor || (actor.id !== userId && !actor.isSuperAdmin)) {
        throw new Error("Not authorized");
    }
}

// Helper function to send a magic link to the user
async function sendMagicLink(email: string) {
    try {
        // Use the existing signIn function with the resend provider
        // This will create the user if they don't exist and send a magic link
        await signIn("resend", { email }, { redirectTo: "/" });
        console.log(`Magic link sent to ${email}`);
        return true;
    } catch (error) {
        console.error('Error sending magic link:', error);
        return false;
    }
}

/**
 * Get a user's notification preference for a specific city, if it exists.
 * Returns the preference with topics and locations, or null.
 */
export async function getNotificationPreferenceForCity(userId: string, cityId: string) {
    await requireSelfOrSuperadmin(userId);
    return prisma.notificationPreference.findUnique({
        where: { userId_cityId: { userId, cityId } },
        include: { interests: true, locations: true },
    });
}

export type CityNotificationPreference = NonNullable<Awaited<ReturnType<typeof getNotificationPreferenceForCity>>>;

/**
 * Get all user preferences (notifications and petitions)
 */
export async function getUserPreferences(): Promise<UserPreference[]> {
    const session = await getServerSession();

    if (!session?.user?.email) {
        throw new Error("User not authenticated");
    }

    try {
        // Find the user
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });

        if (!user) {
            throw new Error("User not found");
        }

        // Get user's notification preferences
        const notificationPreferences = await prisma.notificationPreference.findMany({
            where: { userId: user.id },
            include: {
                city: true,
                locations: true,
                interests: true,
            }
        });

        // Get user's petitions
        const petitions = await prisma.petition.findMany({
            where: { userId: user.id },
            include: {
                city: true,
            }
        });

        // Combine results
        const cities = [...notificationPreferences.map(np => np.city), ...petitions.map(p => p.city)];
        const citiesWithGeometry = await attachGeometryToCities(cities);

        // Get all location IDs that need coordinates
        const allLocationIds = notificationPreferences.flatMap(np =>
            np.locations.map(loc => loc.id)
        );

        console.log('All location IDs to fetch:', allLocationIds);

        // Prepare to store the locations with proper coordinates
        let locationsWithCoordinates: Record<string, { id: string, text: string, coordinates: [number, number] }> = {};

        // If there are any locations, get their coordinates using the same pattern as attachGeometryToCities
        if (allLocationIds.length > 0) {
            try {
                const locationsWithGeometry = await prisma.$queryRaw<
                    ({ id: string, text: string, geometry: string | null })[]
                >`SELECT 
                    l."id" AS id,
                    l."text" AS text,
                    ST_AsGeoJSON(l.coordinates)::text AS geometry
                FROM "Location" l
                WHERE l.id IN (${Prisma.join(allLocationIds)})
                `;

                console.log('Raw locations with geometry:', locationsWithGeometry);

                // Process each location to extract coordinates from GeoJSON
                locationsWithGeometry.forEach(loc => {
                    if (loc.geometry) {
                        try {
                            const parsed = JSON.parse(loc.geometry);
                            console.log(`Parsed geometry for location ${loc.id}:`, parsed);

                            // Extract coordinates if it's a point
                            if (parsed.type === 'Point' &&
                                Array.isArray(parsed.coordinates) &&
                                parsed.coordinates.length === 2) {

                                // Store the location with its coordinates
                                locationsWithCoordinates[loc.id] = {
                                    id: loc.id,
                                    text: loc.text,
                                    coordinates: parsed.coordinates as [number, number]
                                };

                                console.log(`Extracted coordinates for location ${loc.id}:`, parsed.coordinates);
                            }
                        } catch (err) {
                            console.error(`Error parsing geometry for location ${loc.id}:`, err);
                        }
                    }
                });

                console.log('Processed locations with coordinates:', locationsWithCoordinates);
            } catch (error) {
                console.error('Error fetching location geometry:', error);
            }
        }

        const preferences: UserPreference[] = [];

        // Add notification preferences
        for (const np of notificationPreferences) {
            const cityWithGeometry = citiesWithGeometry.find(c => c.id === np.cityId);

            if (cityWithGeometry) {
                // Map locations, using coordinates from our processed locations
                const processedLocations = np.locations.map(loc => {
                    // Look up the location with coordinates
                    const locationWithCoords = locationsWithCoordinates[loc.id];

                    if (locationWithCoords) {
                        console.log(`Using processed location ${loc.id} with coordinates:`, locationWithCoords.coordinates);
                        return {
                            id: loc.id,
                            text: loc.text,
                            coordinates: locationWithCoords.coordinates
                        };
                    } else {
                        console.warn(`No coordinates found for location ${loc.id}, using default [0,0]`);
                        return {
                            id: loc.id,
                            text: loc.text,
                            coordinates: [0, 0] as [number, number]
                        };
                    }
                });

                preferences.push({
                    cityId: np.cityId,
                    city: cityWithGeometry,
                    isPetition: false,
                    locations: processedLocations,
                    topics: np.interests,
                });
            }
        }

        // Add petitions
        for (const petition of petitions) {
            const cityWithGeometry = citiesWithGeometry.find(c => c.id === petition.cityId);

            if (cityWithGeometry) {
                // For the petition model, we need to create a name from userId if it doesn't exist
                // The prisma model doesn't have a name field
                const petitionName = user.name || `User-${user.id.slice(0, 8)}`;

                preferences.push({
                    cityId: petition.cityId,
                    city: cityWithGeometry,
                    isPetition: true,
                    petitionData: {
                        name: petitionName,
                        isResident: petition.is_resident,
                        isCitizen: petition.is_citizen
                    }
                });
            }
        }

        return preferences;

    } catch (error) {
        console.error('Error fetching user preferences:', error);
        throw error;
    }
}

type OnboardingData = {
    cityId: string;
    phone?: string;
    email?: string; // For non-authenticated users
    name?: string;
    // Dev-seed-only convenience: lets the seed-users API create users without a
    // session and without a magic link. SECURITY: these actions are reachable as
    // Server Actions from the public onboarding client, so this field is
    // attacker-controllable. It is always run through sanitizeSeedUser(), which
    // returns undefined off local dev and otherwise allow-lists benign fields —
    // never isSuperAdmin or identity fields. Never spread the raw value.
    seedUser?: Partial<User>;
}

// Neutralize the dev-seed convenience field before it can influence auth or user
// creation. Off local dev (production/preview: IS_DEV === false) it is ignored
// entirely, so the onboarding Server Actions cannot skip the session check or
// mass-assign privileges. In local dev only the four benign seed fields survive.
function sanitizeSeedUser(
    seedUser: Partial<User> | undefined
): Partial<Pick<User, 'createdAt' | 'onboarded' | 'allowProductUpdates' | 'allowPetitionUpdates'>> | undefined {
    if (!IS_DEV || !seedUser) return undefined;
    const { createdAt, onboarded, allowProductUpdates, allowPetitionUpdates } = seedUser;
    return { createdAt, onboarded, allowProductUpdates, allowPetitionUpdates };
}

/**
 * Create or update notification preferences
 */
export async function saveNotificationPreferences(data: OnboardingData & {
    locations: { text: string; coordinates: [number, number] }[];
    topicIds: string[];
}): Promise<Result<NotificationPreference>> {
    const validation = saveNotificationPreferencesSchema.safeParse(data);
    if (!validation.success) {
        return createError('Invalid input');
    }
    const { cityId, locations, topicIds, phone, email, name, seedUser: rawSeedUser } = data;
    // Harden the attacker-controllable seed field: undefined off local dev, and
    // otherwise stripped to benign fields only (see sanitizeSeedUser).
    const seedUser = sanitizeSeedUser(rawSeedUser);
    // Only call getServerSession if not in seed/CLI mode (avoids Next.js request context requirement)
    const session = seedUser ? null : await getServerSession();

    let userId: string;
    let isNewlyCreatedUser = false;

    console.log('Saving notification preferences for cityId:', cityId);
    console.log('Locations:', locations);
    console.log('Topic IDs:', topicIds);
    console.log('Phone:', phone);
    console.log('Email:', email);
    console.log('Name:', name);

    try {
        // Get or create user
        if (!seedUser && session?.user?.email) {
            // Authenticated user
            const user = await prisma.user.findUnique({
                where: { email: session.user.email }
            });

            if (!user) {
                throw new Error("User not found");
            }

            userId = user.id;

            // Update phone if provided
            if (phone) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { phone }
                });
            }
        } else if (email) {
            // Non-authenticated user
            // Check if this email already exists
            let user = await prisma.user.findUnique({
                where: { email }
            });

            if (user) {
                // Email exists but user is not authenticated - return error
                return createError("email_exists");
            } else {
                // Create new user
                const newUser = await prisma.user.create({
                    data: {
                        email,
                        name: name || '',
                        phone,
                        allowProductUpdates: true,
                        onboarded: true,
                        ...seedUser
                    }
                });

                userId = newUser.id;
                isNewlyCreatedUser = true;

                if (!seedUser) {
                    // seed users are created during development, so we don't need to send a magic link
                    await sendMagicLink(email);
                }
            }
        } else {
            throw new Error("Either authenticated session or email must be provided");
        }

        // Verify the topics exist before connecting them. Topics are a global,
        // pre-existing taxonomy looked up by id; locations, by contrast, are
        // created below from their raw data.
        let validTopicIds: string[] = [];
        if (topicIds && topicIds.length > 0) {
            const topics = await prisma.topic.findMany({
                where: { id: { in: topicIds } },
                select: { id: true }
            });
            validTopicIds = topics.map(topic => topic.id);
        }

        // Create the locations and the preference in one transaction. The
        // locations are created here (server-side, at submit time) rather than
        // by a separate client action, and they commit only together with the
        // preference — so an abandoned or failing submit (e.g. the email_exists
        // return above) never leaves orphaned Location rows behind.
        const { preference, wasNew } = await prisma.$transaction(async (tx) => {
            const locationIds: string[] = [];
            for (const loc of locations) {
                const rows = await tx.$queryRaw<{ id: string }[]>`
                    INSERT INTO "Location" ("id", "text", "type", "coordinates")
                    VALUES (
                        gen_random_uuid(),
                        ${loc.text},
                        'point'::"LocationType",
                        ST_SetSRID(ST_MakePoint(${loc.coordinates[0]}, ${loc.coordinates[1]}), 4326)
                    )
                    RETURNING id
                `;
                if (rows[0]) locationIds.push(rows[0].id);
            }

            const locationConnect = locationIds.length > 0
                ? { connect: locationIds.map(id => ({ id })) }
                : undefined;
            const interestConnect = validTopicIds.length > 0
                ? { connect: validTopicIds.map(id => ({ id })) }
                : undefined;

            const existing = await tx.notificationPreference.findUnique({
                where: { userId_cityId: { userId, cityId } },
                select: { id: true },
            });

            if (existing) {
                // Replace the connections wholesale: clear, then reconnect.
                await tx.notificationPreference.update({
                    where: { id: existing.id },
                    data: { locations: { set: [] }, interests: { set: [] } },
                });
                const updated = await tx.notificationPreference.update({
                    where: { id: existing.id },
                    data: { locations: locationConnect, interests: interestConnect },
                    include: { city: true, locations: true, interests: true },
                });
                return { preference: updated, wasNew: false };
            }

            const created = await tx.notificationPreference.create({
                data: { userId, cityId, locations: locationConnect, interests: interestConnect },
                include: { city: true, locations: true, interests: true },
            });
            return { preference: created, wasNew: true };
        });

        // Alerts and welcome messages fire only for a brand-new preference, and
        // only after the transaction commits.
        if (wasNew) {
            sendNotificationSignupAdminAlert({
                cityId,
                cityName: preference.city.name_en,
                locationCount: preference.locations.length,
                topicCount: preference.interests.length,
            });

            if (isNewlyCreatedUser) {
                sendUserOnboardedAdminAlert({
                    cityId,
                    cityName: preference.city.name_en,
                    onboardingSource: 'notification_preferences',
                });
            }

            // Send welcome messages to new signups (non-blocking)
            sendWelcomeMessages(userId, preference.city, phone).catch(err =>
                console.error('Error sending welcome messages:', err)
            );
        }

        return createSuccess(preference);
    } catch (error) {
        console.error('Error saving notification preferences:', error);
        return createError('An unexpected error occurred.');
    }
}

/**
 * Create or update petition
 */
export async function savePetition(data: OnboardingData & {
    isResident: boolean;
    isCitizen: boolean;
}): Promise<Result<Petition>> {
    const validation = savePetitionSchema.safeParse(data);
    if (!validation.success) {
        return createError('Invalid input');
    }
    const { cityId, isResident, isCitizen, phone, email, name, seedUser: rawSeedUser } = data;
    // Harden the attacker-controllable seed field: undefined off local dev, and
    // otherwise stripped to benign fields only (see sanitizeSeedUser).
    const seedUser = sanitizeSeedUser(rawSeedUser);
    const session = await getServerSession();

    let userId: string;
    let isNewlyCreatedUser = false;

    try {
        // Get or create user
        if (!seedUser && session?.user?.email) {
            // Authenticated user
            const user = await prisma.user.findUnique({
                where: { email: session.user.email }
            });

            if (!user) {
                throw new Error("User not found");
            }

            userId = user.id;

            // Always set allowPetitionUpdates (submitting a petition is implicit
            // consent for petition updates); merge phone in if provided.
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    allowPetitionUpdates: true,
                    ...(phone ? { phone } : {}),
                },
            });
        } else if (email) {
            // Non-authenticated user
            // Check if this email already exists
            let user = await prisma.user.findUnique({
                where: { email }
            });

            if (user) {
                // Email exists but user is not authenticated - return error
                return createError("email_exists");
            } else {
                // Create new user
                const newUser = await prisma.user.create({
                    data: {
                        email,
                        name: name || '',
                        phone,
                        allowProductUpdates: true,
                        allowPetitionUpdates: true,
                        onboarded: true,
                        ...seedUser
                    }
                });

                userId = newUser.id;
                isNewlyCreatedUser = true;

                if (!seedUser) {
                    // seed users are created during development, so we don't need to send a magic link
                    await sendMagicLink(email);
                }
            }
        } else {
            throw new Error("Either authenticated session or email must be provided");
        }

        // Check if petition already exists
        const existingPetition = await prisma.petition.findUnique({
            where: {
                userId_cityId: {
                    userId,
                    cityId
                }
            }
        });

        if (existingPetition) {
            // Update existing petition
            const result = await prisma.petition.update({
                where: { id: existingPetition.id },
                data: {
                    is_resident: isResident,
                    is_citizen: isCitizen
                },
                include: {
                    city: true
                }
            });
            return createSuccess(result);
        } else {
            // Create new petition
            const result = await prisma.petition.create({
                data: {
                    userId,
                    cityId,
                    is_resident: isResident,
                    is_citizen: isCitizen
                },
                include: {
                    city: true
                }
            });

            // Send Discord admin alert for new petition
            sendPetitionReceivedAdminAlert({
                cityId,
                cityName: result.city.name_en,
                isResident: isResident,
                isCitizen: isCitizen,
            });

            // Send Discord admin alert for user onboarding (if we just created the user)
            if (isNewlyCreatedUser) {
                sendUserOnboardedAdminAlert({
                    cityId,
                    cityName: result.city.name_en,
                    onboardingSource: 'petition',
                });
            }

            return createSuccess(result);
        }
    } catch (error) {
        console.error('Error saving petition:', error);
        return createError('An unexpected error occurred.');
    }
}

/**
 * Calculate if any user locations are within specified distance of subject location
 */
export async function calculateProximityMatches(
    userLocationIds: string[],
    subjectLocationId: string,
    distanceMeters: number
): Promise<boolean> {
    if (!userLocationIds.length || !subjectLocationId) {
        return false;
    }

    try {
        const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*) as count
            FROM "Location" ul
            CROSS JOIN "Location" sl
            WHERE ul.id = ANY(${userLocationIds})
            AND sl.id = ${subjectLocationId}
            AND sl.type = 'point'
            AND ST_DWithin(
                ul.coordinates::geography,
                sl.coordinates::geography,
                ${distanceMeters}
            )
        `;

        return result[0] && Number(result[0].count) > 0;
    } catch (error) {
        console.error('Error calculating proximity matches:', error);
        return false;
    }
}

/**
 * Core notification creation function
 * Creates notifications for a meeting based on subject importance and user preferences
 */
// Caller-gated: invoked by the processAgenda/summarize tasks (no user session)
// as well as the per-city notifications route and the superadmin conversations
// action. Because a task caller has no session, this cannot take an inner auth
// gate; its user-facing callers authorize first. This server-only module keeps
// the function off the Server Action surface.
export async function createNotificationsForMeeting(
    cityId: string,
    meetingId: string,
    type: 'beforeMeeting' | 'afterMeeting',
    subjectImportanceOverrides?: Record<string, {
        topicImportance: 'doNotNotify' | 'normal' | 'high';
        proximityImportance: 'none' | 'near' | 'wide';
    }>
): Promise<{ notificationsCreated: number; subjectsTotal: number; notificationIds: string[] }> {
    try {
        console.log(`Creating ${type} notifications for meeting ${meetingId} in city ${cityId}`);

        // Fetch meeting with subjects and administrative body
        const meeting = await prisma.councilMeeting.findUnique({
            where: { cityId_id: { cityId, id: meetingId } },
            include: {
                subjects: {
                    include: {
                        topic: true,
                        location: true
                    }
                },
                city: true,
                administrativeBody: true
            }
        });

        if (!meeting) {
            throw new Error(`Meeting ${meetingId} not found`);
        }

        // Get all users with notification preferences for this city
        const notificationPreferences = await prisma.notificationPreference.findMany({
            where: { cityId },
            include: {
                user: true,
                locations: true,
                interests: true
            }
        });

        if (notificationPreferences.length === 0) {
            console.log('No users with notification preferences for this city');
            return { notificationsCreated: 0, subjectsTotal: 0, notificationIds: [] };
        }

        // Transform notification preferences to the format expected by matching function
        // Group by userId to ensure we only have one entry per user (even though unique constraint should prevent duplicates)
        const usersWithPreferencesMap = new Map<string, {
            userId: string;
            locations: { id: string }[];
            interests: { id: string }[];
        }>();
        const userPrefMap = new Map<string, typeof notificationPreferences[0]>();

        for (const pref of notificationPreferences) {
            if (!usersWithPreferencesMap.has(pref.userId)) {
                usersWithPreferencesMap.set(pref.userId, {
                    userId: pref.userId,
                    locations: pref.locations.map(loc => ({ id: loc.id })),
                    interests: pref.interests.map(interest => ({ id: interest.id }))
                });
                userPrefMap.set(pref.userId, pref);
            } else {
                // If user already exists, merge locations and interests (shouldn't happen due to unique constraint, but be safe)
                const existing = usersWithPreferencesMap.get(pref.userId)!;
                const locationIds = new Set([...existing.locations.map(l => l.id), ...pref.locations.map(l => l.id)]);
                const interestIds = new Set([...existing.interests.map(i => i.id), ...pref.interests.map(i => i.id)]);
                usersWithPreferencesMap.set(pref.userId, {
                    userId: pref.userId,
                    locations: Array.from(locationIds).map(id => ({ id })),
                    interests: Array.from(interestIds).map(id => ({ id }))
                });
                // Keep the first preference for user data access
            }
        }

        const usersWithPreferences = Array.from(usersWithPreferencesMap.values());

        console.log(`Found ${usersWithPreferences.length} users with preferences`);

        // Transform subjects to the format expected by matching function
        const subjectsForMatching = meeting.subjects.map(subject => ({
            id: subject.id,
            topicId: subject.topicId,
            locationId: subject.locationId
        }));

        // Build effective importance overrides:
        // - If overrides are provided (manual creation), use them
        // - Otherwise, use the subject's stored importance values
        const effectiveOverrides: Record<string, {
            topicImportance: 'doNotNotify' | 'normal' | 'high';
            proximityImportance: 'none' | 'near' | 'wide';
        }> = subjectImportanceOverrides || {};

        if (!subjectImportanceOverrides) {
            for (const subject of meeting.subjects) {
                effectiveOverrides[subject.id] = {
                    topicImportance: (subject.topicImportance as 'doNotNotify' | 'normal' | 'high') || 'normal',
                    proximityImportance: (subject.proximityImportance as 'none' | 'near' | 'wide') || 'none'
                };
            }
        }

        // Use shared matching logic to determine which users should be notified
        const userSubjectMatches = await matchUsersToSubjects(
            subjectsForMatching,
            usersWithPreferences,
            effectiveOverrides
        );

        // Filter out users with no matching subjects
        const usersToNotify = Array.from(userSubjectMatches.entries())
            .filter(([_, subjects]) => subjects.size > 0);

        if (usersToNotify.length === 0) {
            console.log('No users matched any subjects');
            return { notificationsCreated: 0, subjectsTotal: 0, notificationIds: [] };
        }

        console.log(`Creating notifications for ${usersToNotify.length} users`);

        // Create notifications and deliveries
        const notificationIds: string[] = [];
        let totalSubjects = 0;

        for (const [userId, subjectMatches] of usersToNotify) {
            const userPref = userPrefMap.get(userId)!;
            const user = userPref.user;

            if (!userPref.notifyByEmail && !userPref.notifyByPhone) {
                continue;
            }

            try {
                // Create the notification
                const notification = await prisma.notification.create({
                    data: {
                        userId,
                        cityId,
                        meetingId,
                        type,
                        subjects: {
                            create: Array.from(subjectMatches).map(match => ({
                                subjectId: match.subjectId,
                                reason: match.reason
                            }))
                        }
                    },
                    include: {
                        subjects: {
                            include: {
                                subject: {
                                    include: {
                                        topic: true,
                                        location: true
                                    }
                                }
                            }
                        }
                    }
                });

                notificationIds.push(notification.id);
                totalSubjects += notification.subjects.length;

                // Generate email and SMS content
                const notificationData = {
                    id: notification.id,
                    userId,
                    cityId,
                    type,
                    subjects: notification.subjects.map(ns => ({
                        id: ns.subject.id,
                        name: ns.subject.name,
                        description: ns.subject.description,
                        topic: ns.subject.topic ? {
                            name: ns.subject.topic.name,
                            colorHex: ns.subject.topic.colorHex
                        } : null
                    })),
                    meeting: {
                        dateTime: meeting.dateTime,
                        administrativeBody: meeting.administrativeBody
                    },
                    city: {
                        name_municipality: meeting.city.name_municipality
                    }
                };

                // Create email delivery if user wants to be notified by email
                if (userPref.notifyByEmail) {
                    const emailContent = await generateEmailContent(notificationData);
                    await prisma.notificationDelivery.create({
                        data: {
                            notificationId: notification.id,
                            medium: 'email',
                            status: 'pending',
                            email: user.email,
                            title: emailContent.title,
                            body: emailContent.body
                        }
                    });
                }

                // Create message delivery if user has phone and wants to be notified by phone.
                // Users on the Notis rollout (notisEnabledAt set) get their WhatsApp
                // messages from Notis — creating a message delivery here would serve
                // them by both paths. Email stays untouched.
                if (userPref.notifyByPhone && user.phone && !user.notisEnabledAt) {
                    const smsBody = await generateSmsContent(notificationData);
                    await prisma.notificationDelivery.create({
                        data: {
                            notificationId: notification.id,
                            medium: 'message',
                            status: 'pending',
                            phone: user.phone,
                            body: smsBody
                        }
                    });
                }
            } catch (error: any) {
                // Handle unique constraint error - notification already exists
                if (error?.code === 'P2002' && error?.meta?.target?.includes('userId') && error?.meta?.target?.includes('cityId') && error?.meta?.target?.includes('meetingId') && error?.meta?.target?.includes('type')) {
                    console.log(`Notification already exists for user ${userId}, city ${cityId}, meeting ${meetingId}, type ${type} - skipping`);
                    continue;
                }
                // Re-throw other errors
                throw error;
            }
        }

        console.log(`Created ${notificationIds.length} notifications with ${totalSubjects} total subject matches`);

        return {
            notificationsCreated: notificationIds.length,
            subjectsTotal: totalSubjects,
            notificationIds
        };

    } catch (error) {
        console.error('Error creating notifications for meeting:', error);
        throw error;
    }
}

/**
 * Update delivery status after send attempt
 */
// Caller-gated: driven by the delivery sender (deliver.ts), which runs from the
// admin/city "release notifications" routes. No cityId is available here to
// scope on; the routes authorize. Tracked follow-up to move off the action surface.
export async function updateDeliveryStatus(
    deliveryId: string,
    status: 'sent' | 'failed' | 'skipped',
    messageSentVia?: 'whatsapp' | 'sms'
) {
    await prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
            status,
            sentAt: status === 'sent' ? new Date() : undefined,
            messageSentVia: messageSentVia || undefined
        }
    });
}

/**
 * Get pending deliveries for notifications
 */
export async function getPendingDeliveries(notificationIds: string[]) {
    return await prisma.notificationDelivery.findMany({
        where: {
            notificationId: { in: notificationIds },
            status: 'pending'
        },
        include: {
            notification: {
                include: {
                    user: true,
                    city: true,
                    meeting: {
                        include: {
                            administrativeBody: true
                        }
                    },
                    subjects: {
                        include: {
                            subject: {
                                include: {
                                    topic: true
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}

// Types for meeting-grouped notification stats
export type NotificationStatusCounts = {
    sent: number;
    pending: number;
    failed: number;
    // Every delivery deliberately withheld (e.g. the Notis rollout skipping
    // the message medium) — distinct from sent so rollout observability is
    // honest.
    skipped: number;
    total: number;
};

export type MeetingNotificationStats = {
    meetingId: string;
    meetingName: string;
    meetingDate: Date;
    cityId: string;
    cityName: string;
    administrativeBodyName: string | null;
    before: NotificationStatusCounts | null;
    after: NotificationStatusCounts | null;
};

export type MeetingNotificationsGrouped = {
    meetings: MeetingNotificationStats[];
    pagination: {
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
};

/**
 * Get notifications grouped by meeting for admin dashboard
 * Returns paginated meetings with notification stats (before/after with status counts)
 */
export async function getNotificationsGroupedByMeeting(filters: {
    cityId?: string;
    status?: 'pending' | 'sent' | 'failed' | 'skipped';
    type?: 'beforeMeeting' | 'afterMeeting';
    startDate?: Date;
    endDate?: Date;
    page?: number;
    pageSize?: number;
}): Promise<MeetingNotificationsGrouped> {
    await withUserAuthorizedToEdit({});
    const {
        cityId,
        status,
        type,
        startDate,
        endDate,
        page = 1,
        pageSize = 20
    } = filters;

    // Build the where clause for notifications
    const notificationWhere: Prisma.NotificationWhereInput = {};

    if (startDate || endDate) {
        const dateFilter: { gte?: Date; lte?: Date } = {};
        if (startDate) dateFilter.gte = startDate;
        if (endDate) dateFilter.lte = endDate;
        notificationWhere.meeting = { dateTime: dateFilter };
    }

    if (cityId) {
        notificationWhere.cityId = cityId;
    }

    if (type) {
        notificationWhere.type = type;
    }

    // The status filter must select exactly the notifications the stats below
    // classify with that status — one shared rule builds both halves (see
    // src/lib/notifications/deliveryStatus.ts).
    if (status) {
        Object.assign(notificationWhere, deliveriesWhereForStatus(status));
    }

    // First, get all distinct meeting IDs that have notifications matching our filters
    const notificationsWithMeetings = await prisma.notification.findMany({
        where: notificationWhere,
        select: {
            meetingId: true,
            cityId: true,
            meeting: {
                select: {
                    dateTime: true
                }
            }
        },
        distinct: ['meetingId', 'cityId']
    });

    // Get unique meeting keys and sort by date descending
    const meetingKeys = notificationsWithMeetings
        .map(n => ({ meetingId: n.meetingId, cityId: n.cityId, dateTime: n.meeting.dateTime }))
        .sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

    const totalMeetings = meetingKeys.length;
    const totalPages = Math.ceil(totalMeetings / pageSize);

    // Paginate the meeting keys
    const paginatedMeetingKeys = meetingKeys.slice((page - 1) * pageSize, page * pageSize);

    if (paginatedMeetingKeys.length === 0) {
        return {
            meetings: [],
            pagination: {
                total: totalMeetings,
                page,
                pageSize,
                totalPages
            }
        };
    }

    // Fetch full notification data for the paginated meetings
    const notifications = await prisma.notification.findMany({
        where: {
            OR: paginatedMeetingKeys.map(mk => ({
                meetingId: mk.meetingId,
                cityId: mk.cityId
            }))
        },
        include: {
            city: {
                select: {
                    id: true,
                    name: true,
                    name_municipality: true
                }
            },
            meeting: {
                select: {
                    id: true,
                    name: true,
                    dateTime: true,
                    administrativeBody: {
                        select: {
                            name: true
                        }
                    }
                }
            },
            deliveries: {
                select: {
                    status: true
                }
            }
        }
    });

    // Group notifications by meeting and calculate stats
    const meetingStatsMap = new Map<string, MeetingNotificationStats>();

    for (const notification of notifications) {
        const key = `${notification.cityId}-${notification.meetingId}`;

        if (!meetingStatsMap.has(key)) {
            meetingStatsMap.set(key, {
                meetingId: notification.meetingId,
                meetingName: notification.meeting.name,
                meetingDate: notification.meeting.dateTime,
                cityId: notification.cityId,
                cityName: notification.city.name_municipality || notification.city.name,
                administrativeBodyName: notification.meeting.administrativeBody?.name || null,
                before: null,
                after: null
            });
        }

        const stats = meetingStatsMap.get(key)!;

        // One shared rule with the status filter above — see
        // src/lib/notifications/deliveryStatus.ts.
        const notificationStatus = classifyDeliveries(notification.deliveries.map(d => d.status));

        // Update the appropriate type stats
        const typeKey = notification.type === 'beforeMeeting' ? 'before' : 'after';

        if (!stats[typeKey]) {
            stats[typeKey] = { sent: 0, pending: 0, failed: 0, skipped: 0, total: 0 };
        }

        stats[typeKey]![notificationStatus]++;
        stats[typeKey]!.total++;
    }

    // Convert map to array and sort by meeting date descending
    const meetings = Array.from(meetingStatsMap.values())
        .sort((a, b) => new Date(b.meetingDate).getTime() - new Date(a.meetingDate).getTime());

    return {
        meetings,
        pagination: {
            total: totalMeetings,
            page,
            pageSize,
            totalPages
        }
    };
}

/**
 * Get all notifications for a specific meeting (used when expanding a meeting row)
 */
export async function getNotificationsForMeeting(
    meetingId: string,
    cityId: string,
    type?: 'beforeMeeting' | 'afterMeeting'
) {
    await withUserAuthorizedToEdit({ cityId });
    const whereClause: Prisma.NotificationWhereInput = {
        meetingId,
        cityId
    };

    if (type) {
        whereClause.type = type;
    }

    return await prisma.notification.findMany({
        where: whereClause,
        include: {
            user: {
                select: {
                    id: true,
                    email: true,
                    name: true
                }
            },
            deliveries: {
                select: {
                    id: true,
                    medium: true,
                    status: true,
                    email: true,
                    phone: true,
                    messageSentVia: true,
                    sentAt: true,
                    createdAt: true
                }
            },
            subjects: {
                select: {
                    reason: true,
                    subject: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
}

/**
 * Delete all notifications for specified meetings (bulk delete)
 * Optionally filter by notification type (beforeMeeting/afterMeeting)
 */
export async function deleteNotificationsForMeetings(
    meetingKeys: Array<{ meetingId: string; cityId: string }>,
    type?: 'beforeMeeting' | 'afterMeeting'
): Promise<number> {
    await withUserAuthorizedToEdit({});
    const result = await prisma.notification.deleteMany({
        where: {
            OR: meetingKeys.map(mk => ({
                meetingId: mk.meetingId,
                cityId: mk.cityId,
                ...(type && { type })
            }))
        }
    });

    return result.count;
}

/**
 * Get all cities that have notifications (for filter dropdown)
 */
export async function getCitiesWithNotifications(): Promise<Array<{ id: string; name: string }>> {
    await withUserAuthorizedToEdit({});
    const cities = await prisma.notification.findMany({
        select: {
            city: {
                select: {
                    id: true,
                    name: true,
                    name_municipality: true
                }
            }
        },
        distinct: ['cityId']
    });

    return cities.map(n => ({
        id: n.city.id,
        name: n.city.name_municipality || n.city.name
    }));
}

/**
 * Get all notification preferences for a user
 */
export async function getUserNotificationPreferences(userId: string) {
    await requireSelfOrSuperadmin(userId);
    try {
        const preferences = await prisma.notificationPreference.findMany({
            where: { userId },
            include: {
                city: {
                    select: {
                        id: true,
                        name: true,
                        name_municipality: true
                    }
                },
                locations: {
                    select: {
                        id: true,
                        text: true
                    }
                },
                interests: {
                    select: {
                        id: true,
                        name: true,
                        colorHex: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        return preferences;
    } catch (error) {
        console.error('Error fetching user notification preferences:', error);
        throw new Error('Failed to fetch notification preferences');
    }
}

/**
 * Update notification channel preferences (email/phone) for a preference
 */
export async function updateNotificationPreferenceChannels(
    preferenceId: string,
    userId: string,
    channels: { notifyByEmail?: boolean; notifyByPhone?: boolean }
) {
    await requireSelfOrSuperadmin(userId);
    const preference = await prisma.notificationPreference.findUnique({
        where: { id: preferenceId }
    });

    if (!preference || preference.userId !== userId) {
        throw new NotFoundError('Notification preference not found');
    }

    return prisma.notificationPreference.update({
        where: { id: preferenceId },
        data: channels,
    });
}

/**
 * Delete a notification preference
 */
export async function deleteNotificationPreference(preferenceId: string, userId: string) {
    await requireSelfOrSuperadmin(userId);
    try {
        // Verify this preference belongs to the user
        const preference = await prisma.notificationPreference.findUnique({
            where: { id: preferenceId }
        });

        if (!preference || preference.userId !== userId) {
            throw new NotFoundError('Notification preference not found');
        }

        // Delete the preference
        await prisma.notificationPreference.delete({
            where: { id: preferenceId }
        });

        return { success: true };
    } catch (error) {
        console.error('Error deleting notification preference:', error);
        throw error;
    }
}

/**
 * Fetch the data the unsubscribe page needs to render for a (userId, cityId)
 * pair extracted from an unsubscribe token. Returns null if the user no
 * longer exists.
 */
export async function getUnsubscribeContext(userId: string, cityId?: string): Promise<{
    cityName: string | null;
    userEmail: string;
    allowProductUpdates: boolean;
    allowPetitionUpdates: boolean;
    citySubscribed: boolean;
} | null> {
    const [city, user, cityPreference] = await Promise.all([
        cityId
            ? prisma.city.findUnique({
                where: { id: cityId },
                select: { name_municipality: true },
            })
            : Promise.resolve(null),
        prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, allowProductUpdates: true, allowPetitionUpdates: true },
        }),
        cityId
            ? prisma.notificationPreference.findUnique({
                where: { userId_cityId: { userId, cityId } },
                select: { notifyByEmail: true, notifyByPhone: true },
            })
            : Promise.resolve(null),
    ]);

    if (!user) return null;

    return {
        cityName: city?.name_municipality ?? null,
        userEmail: user.email,
        allowProductUpdates: user.allowProductUpdates,
        allowPetitionUpdates: user.allowPetitionUpdates,
        citySubscribed: Boolean(
            cityPreference && (cityPreference.notifyByEmail || cityPreference.notifyByPhone),
        ),
    };
}

// The three unsubscribe functions below take a userId but are authorized by a
// signed unsubscribe token at the route/page (no session), so they cannot use
// requireSelfOrSuperadmin. This server-only module prevents direct browser
// calls that bypass the token check.
export async function disableAllNotificationPreferences(userId: string) {
    await prisma.notificationPreference.updateMany({
        where: { userId },
        data: { notifyByEmail: false, notifyByPhone: false },
    });
}

/**
 * Set the user-level email subscription flags. Authorized by the unsubscribe
 * token at the calling route — see the note above disableAllNotificationPreferences.
 * The email-unsubscribe flow uses this instead of updateUserProfile, which
 * requires a session.
 */
export async function setUserEmailSubscriptionFlags(
    userId: string,
    flags: { allowProductUpdates?: boolean; allowPetitionUpdates?: boolean },
): Promise<void> {
    // updateMany (not update) so a stale unsubscribe link for a since-deleted
    // user is a no-op rather than a P2025 500 — matching disableAll/disableByCity.
    await prisma.user.updateMany({
        where: { id: userId },
        data: flags,
    });
}

export async function disableNotificationPreferenceByCityId(userId: string, cityId: string) {
    // No-op when no row matches: a user clicking the unsubscribe link a second
    // time (or whose city preference was already removed) shouldn't see an error.
    await prisma.notificationPreference.updateMany({
        where: { userId, cityId },
        data: { notifyByEmail: false, notifyByPhone: false },
    });
}


/**
 * Get notifications for a user in a specific city
 */
export async function getUserNotifications(userId: string, cityId?: string, limit: number = 50) {
    await requireSelfOrSuperadmin(userId);
    try {
        const notifications = await prisma.notification.findMany({
            where: {
                userId,
                ...(cityId ? { cityId } : {}),
            },
            include: {
                city: {
                    select: {
                        name: true,
                        name_municipality: true,
                    }
                },
                meeting: {
                    select: {
                        id: true,
                        name: true,
                        dateTime: true
                    }
                },
                subjects: {
                    select: {
                        subject: {
                            select: {
                                name: true
                            }
                        }
                    }
                },
                deliveries: {
                    select: {
                        status: true,
                        medium: true,
                        sentAt: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: limit
        });
        return notifications;
    } catch (error) {
        console.error('Error fetching user notifications:', error);
        throw new Error('Failed to fetch user notifications');
    }
}

/**
 * Get a notification by ID with all related data for public view
 */
export async function getNotificationForView(id: string) {
    try {
        const notification = await prisma.notification.findUnique({
            where: { id },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                city: true,
                meeting: {
                    include: {
                        administrativeBody: true
                    }
                },
                subjects: {
                    include: {
                        subject: {
                            include: {
                                topic: true,
                                location: true
                            }
                        }
                    },
                    orderBy: {
                        createdAt: 'asc'
                    }
                },
                deliveries: {
                    orderBy: {
                        sentAt: 'desc'
                    }
                }
            }
        });

        if (!notification) {
            return null;
        }

        // Get location coordinates if subjects have locations
        const locationIds = notification.subjects
            .map(ns => ns.subject.locationId)
            .filter((id): id is string => id !== null);

        let locationCoordinates: Record<string, [number, number]> = {};

        if (locationIds.length > 0) {
            const coords = await prisma.$queryRaw<Array<{ id: string; x: number; y: number }>>`
                SELECT id, ST_X(coordinates::geometry) as x, ST_Y(coordinates::geometry) as y
                FROM "Location"
                WHERE id = ANY(${locationIds})
                AND type = 'point'
            `;

            locationCoordinates = coords.reduce((acc, loc) => {
                acc[loc.id] = [loc.x, loc.y];
                return acc;
            }, {} as Record<string, [number, number]>);
        }

        // Fetch statistics for each subject
        const { getStatisticsFor } = await import('@/lib/statistics');
        const subjectStatsPromises = notification.subjects.map(ns =>
            getStatisticsFor({ subjectId: ns.subject.id }, ['party']).catch(() => null)
        );
        const subjectStats = await Promise.all(subjectStatsPromises);

        // Add coordinates and statistics to the response
        return {
            ...notification,
            subjects: notification.subjects.map((ns, idx) => ({
                ...ns,
                subject: {
                    ...ns.subject,
                    location: ns.subject.location ? {
                        ...ns.subject.location,
                        coordinates: ns.subject.locationId ? locationCoordinates[ns.subject.locationId] : null
                    } : null,
                    statistics: subjectStats[idx]
                }
            }))
        };
    } catch (error) {
        console.error('Error fetching notification:', error);
        return null;
    }
}

/**
 * Delete a notification by ID (admin only)
 * Cascade deletes will handle related NotificationSubject and NotificationDelivery records
 */
export async function deleteNotification(id: string): Promise<void> {
    await withUserAuthorizedToEdit({});
    await prisma.notification.delete({
        where: { id }
    });
}

/**
 * Get notification impact preview data for a meeting
 * Returns transformed subjects and users with preferences for matching calculation
 */
export async function getNotificationImpactPreviewData(
    meetingId: string,
    cityId: string
): Promise<{
    subjects: Array<{
        id: string;
        topicId: string | null;
        locationId: string | null;
    }>;
    usersWithPreferences: Array<{
        userId: string;
        locations: { id: string }[];
        interests: { id: string }[];
    }>;
}> {
    await withUserAuthorizedToEdit({ cityId });
    // Fetch meeting with subjects
    const meeting = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        include: {
            subjects: {
                include: {
                    topic: true,
                    location: true
                }
            }
        }
    });

    if (!meeting) {
        throw new Error('Meeting not found');
    }

    // Get all users with notification preferences for this city
    const notificationPreferences = await prisma.notificationPreference.findMany({
        where: { cityId },
        include: {
            user: true,
            locations: true,
            interests: true
        }
    });

    // Transform notification preferences to the format expected by matching function
    // Group by userId to ensure we only have one entry per user (even though unique constraint should prevent duplicates)
    const usersWithPreferencesMap = new Map<string, {
        userId: string;
        locations: { id: string }[];
        interests: { id: string }[];
    }>();

    for (const pref of notificationPreferences) {
        const userId = String(pref.userId).trim();
        if (!usersWithPreferencesMap.has(userId)) {
            usersWithPreferencesMap.set(userId, {
                userId: userId,
                locations: pref.locations.map(loc => ({ id: String(loc.id).trim() })),
                interests: pref.interests.map(interest => ({ id: String(interest.id).trim() }))
            });
        } else {
            // If user already exists, merge locations and interests (shouldn't happen due to unique constraint, but be safe)
            const existing = usersWithPreferencesMap.get(userId)!;
            const locationIds = new Set([
                ...existing.locations.map(l => String(l.id).trim()),
                ...pref.locations.map(l => String(l.id).trim())
            ]);
            const interestIds = new Set([
                ...existing.interests.map(i => String(i.id).trim()),
                ...pref.interests.map(i => String(i.id).trim())
            ]);
            usersWithPreferencesMap.set(userId, {
                userId: userId,
                locations: Array.from(locationIds).map(id => ({ id })),
                interests: Array.from(interestIds).map(id => ({ id }))
            });
        }
    }

    const usersWithPreferences = Array.from(usersWithPreferencesMap.values());

    // Transform subjects to the format expected by matching function
    const subjects = meeting.subjects.map(subject => ({
        id: subject.id,
        topicId: subject.topicId,
        locationId: subject.locationId
    }));

    return {
        subjects,
        usersWithPreferences
    };
}

/**
 * Get map data for notifications (subjects and user preference locations)
 * Returns subject locations and user preference locations with coordinates
 */
export async function getNotificationMapData(meetingId: string, cityId: string): Promise<{
    subjectLocations: Array<{
        id: string;
        name: string;
        locationId: string;
        coordinates: [number, number];
    }>;
    userPreferenceLocations: Array<{
        id: string;
        text: string;
        coordinates: [number, number];
    }>;
}> {
    await withUserAuthorizedToEdit({ cityId });
    // Get ALL subjects for this meeting (not just matched ones)
    const allSubjects = await prisma.subject.findMany({
        where: {
            cityId,
            councilMeetingId: meetingId,
        },
        include: {
            location: true,
        },
    });

    // Collect subject location IDs from ALL subjects
    const subjectLocationIds = allSubjects
        .filter(s => s.locationId)
        .map(s => s.locationId!);

    // Get all notifications for this meeting to find users for preference locations
    const notifications = await prisma.notification.findMany({
        where: {
            cityId,
            meetingId,
        },
        include: {
            user: {
                select: {
                    id: true,
                },
            },
        },
    });

    // Collect unique user IDs
    const userIds = [...new Set(notifications.map(n => n.userId))];

    // Get user notification preference locations
    const userPreferences = await prisma.notificationPreference.findMany({
        where: {
            userId: { in: userIds },
            cityId,
        },
        include: {
            locations: true,
        },
    });

    const userLocationIds = userPreferences.flatMap(pref =>
        pref.locations.map(loc => loc.id)
    );

    // Fetch all location coordinates
    const allLocationIds = [...new Set([...subjectLocationIds, ...userLocationIds])];

    let locationCoordinates: Record<string, { x: number; y: number }> = {};

    if (allLocationIds.length > 0) {
        const coords = await prisma.$queryRaw<Array<{ id: string; x: number; y: number }>>`
            SELECT id, ST_X(coordinates::geometry) as x, ST_Y(coordinates::geometry) as y
            FROM "Location"
            WHERE id = ANY(${allLocationIds}::text[])
            AND type = 'point'
        `;

        locationCoordinates = coords.reduce((acc, loc) => {
            acc[loc.id] = { x: loc.x, y: loc.y };
            return acc;
        }, {} as Record<string, { x: number; y: number }>);
    }

    // Build subject locations with coordinates from ALL subjects
    const subjectLocations: Array<{
        id: string;
        name: string;
        locationId: string;
        coordinates: [number, number];
    }> = [];

    allSubjects.forEach(subject => {
        if (subject.locationId && locationCoordinates[subject.locationId]) {
            const coords = locationCoordinates[subject.locationId];
            subjectLocations.push({
                id: subject.id,
                name: subject.name,
                locationId: subject.locationId,
                coordinates: [coords.x, coords.y],
            });
        }
    });

    // Build user preference locations with coordinates
    const userPreferenceLocations: Array<{
        id: string;
        text: string;
        coordinates: [number, number];
    }> = [];

    userPreferences.forEach(pref => {
        pref.locations.forEach(loc => {
            if (locationCoordinates[loc.id]) {
                const coords = locationCoordinates[loc.id];
                userPreferenceLocations.push({
                    id: loc.id,
                    text: loc.text,
                    coordinates: [coords.x, coords.y],
                });
            }
        });
    });

    return {
        subjectLocations,
        userPreferenceLocations,
    };
}
