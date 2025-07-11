"use server";

import { NotificationPreference, Petition, City, Topic, User, Location, Prisma } from '@prisma/client';
import { auth, signIn } from "@/auth";
import { getCitiesWithGeometry } from "./cities";
import prisma from "@/lib/db/prisma";
import { Result, createSuccess, createError } from "@/lib/result";

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

/**
 * Create or update notification preferences
 */
export async function saveNotificationPreferences(data: {
    cityId: string;
    locationIds: string[];
    topicIds: string[];
    phone?: string;
    email?: string; // For non-authenticated users
    name?: string;
    userId?: string; // Explicit user ID for admin actions
}): Promise<Result<NotificationPreference>> {
    const { cityId, locationIds, topicIds, phone, email, name, userId: explicitUserId } = data;
    const session = await getServerSession();

    let userId: string;

    try {
        if (explicitUserId) {
            userId = explicitUserId;
        } else if (session?.user?.id) {
            userId = session.user.id;
            if (phone && session.user.phone !== phone) {
                await prisma.user.update({
                    where: { id: userId },
                    data: { phone }
                });
            }
        } else if (email) {
            let user = await prisma.user.findUnique({
                where: { email },
            });

            if (!user) {
                console.log(`User with email ${email} not found. Creating new user...`);
                user = await prisma.user.create({
                    data: {
                        email,
                        name: name || '',
                        phone: phone || null,
                        onboarded: true,
                        allowContact: true,
                    },
                });
                console.log('New user created:', user);
            } else {
                console.log('Existing user found:', user);
                if (phone && user.phone !== phone) {
                    await prisma.user.update({
                        where: { id: user.id },
                        data: { phone }
                    });
                    console.log(`Updated phone for user ${user.id}`);
                }
            }
            userId = user.id;
        } else {
            return createError("User not authenticated and no email provided");
        }

        const validLocationIds = await prisma.location.findMany({
            where: {
                id: { in: locationIds },
            },
            select: { id: true }
        }).then(locations => locations.map(l => l.id));

        const validTopicIds = await prisma.topic.findMany({
            where: {
                id: { in: topicIds }
            },
            select: { id: true }
        }).then(topics => topics.map(t => t.id));

        const existingPreference = await prisma.notificationPreference.findFirst({
            where: { userId: userId, cityId: cityId },
        });

        if (existingPreference) {
            const result = await prisma.notificationPreference.update({
                where: { id: existingPreference.id },
                data: {
                    locations: {
                        set: validLocationIds.map(id => ({ id }))
                    },
                    interests: {
                        set: validTopicIds.map(id => ({ id }))
                    }
                }
            });
            return createSuccess(result);
        } else {
            const result = await prisma.notificationPreference.create({
                data: {
                    user: { connect: { id: userId } },
                    city: { connect: { id: cityId } },
                    locations: {
                        connect: validLocationIds.map(id => ({ id }))
                    },
                    interests: {
                        connect: validTopicIds.map(id => ({ id }))
                    }
                }
            });
            return createSuccess(result);
        }
    } catch (error) {
        console.error('Error saving notification preferences:', error);
        return createError('An unexpected error occurred.');
    }
}

/**
 * Create or update a petition
 */
export async function savePetition(data: {
    cityId: string;
    isResident: boolean;
    isCitizen: boolean;
    phone?: string;
    email?: string; // For non-authenticated users
    name?: string; // We'll store this in user if needed, but not in petition
    userId?: string; // Explicit user ID for admin actions
}): Promise<Result<Petition>> {
    const { cityId, isResident, isCitizen, phone, email, name, userId: explicitUserId } = data;
    const session = await getServerSession();

    let userId: string;

    try {
        if (explicitUserId) {
            userId = explicitUserId;
        } else if (session?.user?.id) {
            userId = session.user.id;
            if (phone && session.user.phone !== phone) {
                await prisma.user.update({
                    where: { id: userId },
                    data: { phone }
                });
            }
        } else if (email) {
            let user = await prisma.user.findUnique({
                where: { email },
            });

            if (!user) {
                console.log(`User with email ${email} not found. Creating new user...`);
                user = await prisma.user.create({
                    data: {
                        email,
                        name: name || '',
                        phone: phone || null,
                        onboarded: true,
                        allowContact: true,
                    },
                });
                console.log('New user created from petition:', user);
            } else {
                console.log('Existing user found from petition:', user);
                if (phone && user.phone !== phone) {
                    await prisma.user.update({
                        where: { id: user.id },
                        data: { phone }
                    });
                }
            }
            userId = user.id;
        } else {
            return createError("User not authenticated and no email provided");
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
            return createSuccess(result);
        }
    } catch (error) {
        console.error('Error saving petition:', error);
        return createError('An unexpected error occurred.');
    }
} 