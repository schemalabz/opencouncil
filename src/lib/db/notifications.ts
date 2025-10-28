"use server";

import { NotificationPreference, Petition, City, Topic, User, Location, Prisma } from '@prisma/client';
import { auth, signIn } from "@/auth";
import { getCitiesWithGeometry } from "./cities";
import prisma from "@/lib/db/prisma";
import { Result, createSuccess, createError } from "@/lib/result";
import { sendPetitionReceivedAdminAlert, sendUserOnboardedAdminAlert, sendNotificationSignupAdminAlert } from "@/lib/discord";
import { matchUsersToSubjects } from "@/lib/notifications/matching";
import { generateEmailContent, generateSmsContent } from "@/lib/notifications/content";
import { sendWelcomeMessages } from "@/lib/notifications/welcome";

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
        const citiesWithGeometry = await getCitiesWithGeometry(cities);

        // Get all location IDs that need coordinates
        const allLocationIds = notificationPreferences.flatMap(np =>
            np.locations.map(loc => loc.id)
        );

        console.log('All location IDs to fetch:', allLocationIds);

        // Prepare to store the locations with proper coordinates
        let locationsWithCoordinates: Record<string, { id: string, text: string, coordinates: [number, number] }> = {};

        // If there are any locations, get their coordinates using the same pattern as getCitiesWithGeometry
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
    // If provided, the user is being seeded from the seed-users API
    // This bypasses the session check and the magic link check
    seedUser?: Partial<User>;
}

/**
 * Create or update notification preferences
 */
export async function saveNotificationPreferences(data: OnboardingData & {
    locationIds: string[];
    topicIds: string[];
}): Promise<Result<NotificationPreference>> {
    const { cityId, locationIds, topicIds, phone, email, name, seedUser } = data;
    const session = await getServerSession();

    let userId: string;
    let isNewlyCreatedUser = false;

    console.log('Saving notification preferences for cityId:', cityId);
    console.log('Location IDs:', locationIds);
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
                        allowContact: true,
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

        // Verify locations and topics exist before trying to connect them
        let validLocationIds: string[] = [];
        let validTopicIds: string[] = [];

        if (locationIds && locationIds.length > 0) {
            // Verify locations exist
            const locations = await prisma.location.findMany({
                where: {
                    id: {
                        in: locationIds
                    }
                },
                select: { id: true }
            });
            validLocationIds = locations.map(loc => loc.id);

            console.log('Valid location IDs:', validLocationIds);
        }

        if (topicIds && topicIds.length > 0) {
            // Verify topics exist
            const topics = await prisma.topic.findMany({
                where: {
                    id: {
                        in: topicIds
                    }
                },
                select: { id: true }
            });
            validTopicIds = topics.map(topic => topic.id);

            console.log('Valid topic IDs:', validTopicIds);
        }

        // Check if notification preferences already exist
        const existingPreference = await prisma.notificationPreference.findUnique({
            where: {
                userId_cityId: {
                    userId,
                    cityId
                }
            }
        });

        if (existingPreference) {
            // For existing preferences, update using Prisma's connect/disconnect
            const updatedPreference = await prisma.notificationPreference.update({
                where: { id: existingPreference.id },
                data: {
                    // Disconnect all existing locations and topics
                    locations: {
                        set: [] // First clear all connections
                    },
                    interests: {
                        set: [] // First clear all connections
                    }
                }
            });

            // Then add the new connections if there are any
            if (validLocationIds.length > 0) {
                await prisma.notificationPreference.update({
                    where: { id: updatedPreference.id },
                    data: {
                        locations: {
                            connect: validLocationIds.map(id => ({ id }))
                        }
                    }
                });
            }

            if (validTopicIds.length > 0) {
                await prisma.notificationPreference.update({
                    where: { id: updatedPreference.id },
                    data: {
                        interests: {
                            connect: validTopicIds.map(id => ({ id }))
                        }
                    }
                });
            }

            // Finally, fetch the updated preferences with the new relationships
            const result = await prisma.notificationPreference.findUnique({
                where: { id: updatedPreference.id },
                include: {
                    city: true,
                    locations: true,
                    interests: true
                }
            }) as NotificationPreference;
            return createSuccess(result);
        } else {
            // Create new preferences with existing relationships
            const result = await prisma.notificationPreference.create({
                data: {
                    userId,
                    cityId,
                    // Connect locations and topics directly
                    locations: validLocationIds.length > 0 ? {
                        connect: validLocationIds.map(id => ({ id }))
                    } : undefined,
                    interests: validTopicIds.length > 0 ? {
                        connect: validTopicIds.map(id => ({ id }))
                    } : undefined
                },
                include: {
                    city: true,
                    locations: true,
                    interests: true
                }
            });

            // Send Discord admin alert for new citizen notification signup
            sendNotificationSignupAdminAlert({
                cityName: result.city.name_en,
                locationCount: validLocationIds.length,
                topicCount: validTopicIds.length,
            });

            // Send Discord admin alert for user onboarding (if we just created the user)
            if (isNewlyCreatedUser) {
                sendUserOnboardedAdminAlert({
                    cityName: result.city.name_en,
                    onboardingSource: 'notification_preferences',
                });
            }

            // Send welcome messages to new signups (non-blocking)
            sendWelcomeMessages(userId, result.city, phone).catch(err =>
                console.error('Error sending welcome messages:', err)
            );

            return createSuccess(result);
        }
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
    const { cityId, isResident, isCitizen, phone, email, name, seedUser } = data;
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
                        allowContact: true,
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
                cityName: result.city.name_en,
                isResident: isResident,
                isCitizen: isCitizen,
            });

            // Send Discord admin alert for user onboarding (if we just created the user)
            if (isNewlyCreatedUser) {
                sendUserOnboardedAdminAlert({
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
        // Use PostGIS to check if any user location is within distance of subject location
        const result = await prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*) as count
            FROM "Location" ul
            CROSS JOIN "Location" sl
            WHERE ul.id = ANY(${userLocationIds})
            AND sl.id = ${subjectLocationId}
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
        const usersWithPreferences = await prisma.notificationPreference.findMany({
            where: { cityId },
            include: {
                user: true,
                locations: true,
                interests: true
            }
        });

        if (usersWithPreferences.length === 0) {
            console.log('No users with notification preferences for this city');
            return { notificationsCreated: 0, subjectsTotal: 0, notificationIds: [] };
        }

        console.log(`Found ${usersWithPreferences.length} users with preferences`);

        // Use shared matching logic to determine which users should be notified
        const userSubjectMatches = await matchUsersToSubjects(
            meeting.subjects,
            usersWithPreferences,
            subjectImportanceOverrides
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
            const userPref = usersWithPreferences.find(up => up.userId === userId)!;
            const user = userPref.user;

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
                const emailContent = await generateEmailContent({
                    id: notification.id,
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
                });

                const smsBody = await generateSmsContent({
                    id: notification.id,
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
                });

                // Create email delivery (always)
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

                // Create message delivery if user has phone
                if (user.phone) {
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
export async function updateDeliveryStatus(
    deliveryId: string,
    status: 'sent' | 'failed',
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

/**
 * Get notifications for admin dashboard with filters
 */
export async function getNotificationsForAdmin(filters: {
    cityId?: string;
    status?: 'pending' | 'sent' | 'failed';
    type?: 'beforeMeeting' | 'afterMeeting';
    limit?: number;
    offset?: number;
}) {
    const { cityId, status, type, limit = 50, offset = 0 } = filters;

    const whereClause: any = {};

    if (cityId) {
        whereClause.cityId = cityId;
    }

    if (type) {
        whereClause.type = type;
    }

    // If status filter is provided, filter by delivery status
    const notifications = await prisma.notification.findMany({
        where: whereClause,
        include: {
            city: true,
            meeting: {
                include: {
                    administrativeBody: true
                }
            },
            deliveries: true,
            subjects: {
                include: {
                    subject: true
                }
            },
            user: {
                select: {
                    id: true,
                    email: true,
                    name: true
                }
            }
        },
        orderBy: {
            createdAt: 'desc'
        },
        take: limit,
        skip: offset
    });

    // Filter by delivery status if specified
    if (status) {
        return notifications.filter(n =>
            n.deliveries.some(d => d.status === status)
        );
    }

    return notifications;
}

/**
 * Get all notification preferences for a user
 */
export async function getUserNotificationPreferences(userId: string) {
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
 * Delete a notification preference
 */
export async function deleteNotificationPreference(preferenceId: string, userId: string) {
    try {
        // Verify this preference belongs to the user
        const preference = await prisma.notificationPreference.findUnique({
            where: { id: preferenceId }
        });

        if (!preference || preference.userId !== userId) {
            throw new Error('Notification preference not found');
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
 * Get notifications for a user in a specific city
 */
export async function getUserNotifications(userId: string, cityId: string, limit: number = 50) {
    try {
        const notifications = await prisma.notification.findMany({
            where: {
                userId,
                cityId
            },
            include: {
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
