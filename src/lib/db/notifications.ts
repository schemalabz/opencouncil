"use server";

import { NotificationPreference, Petition, City, Topic, User, Location, Prisma } from '@prisma/client';
import { isUserAuthorizedToEdit, withUserAuthorizedToEdit } from "../auth";
import { auth, signIn } from "@/auth";
import { getCitiesWithGeometry } from "./cities";
import prisma from "@/lib/db/prisma";

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

export type SaveResult<T> = {
    data?: T;
    error?: string;
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
}): Promise<SaveResult<NotificationPreference>> {
    const { cityId, locationIds, topicIds, phone, email, name } = data;
    const session = await getServerSession();

    let userId: string;

    console.log('Saving notification preferences for cityId:', cityId);
    console.log('Location IDs:', locationIds);
    console.log('Topic IDs:', topicIds);
    console.log('Phone:', phone);
    console.log('Email:', email);
    console.log('Name:', name);

    try {
        // Get or create user
        if (session?.user?.email) {
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
                return { error: "email_exists" };
            } else {
                // Create new user
                const newUser = await prisma.user.create({
                    data: {
                        email,
                        name: name || '',
                        phone,
                        allowContact: true,
                        onboarded: true,
                    }
                });

                userId = newUser.id;

                // Send magic link for verification
                await sendMagicLink(email);
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
            return { data: result };
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
            return { data: result };
        }
    } catch (error) {
        console.error('Error saving notification preferences:', error);
        return { error: 'An unexpected error occurred.' };
    }
}

/**
 * Create or update petition
 */
export async function savePetition(data: {
    cityId: string;
    isResident: boolean;
    isCitizen: boolean;
    phone?: string;
    email?: string; // For non-authenticated users
    name?: string; // We'll store this in user if needed, but not in petition
}): Promise<SaveResult<Petition>> {
    const { cityId, isResident, isCitizen, phone, email, name } = data;
    const session = await getServerSession();

    let userId: string;

    try {
        // Get or create user
        if (session?.user?.email) {
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
                return { error: "email_exists" };
            } else {
                // Create new user
                const newUser = await prisma.user.create({
                    data: {
                        email,
                        name: name || '',
                        phone,
                        allowContact: true,
                        onboarded: true,
                    }
                });

                userId = newUser.id;

                // Send magic link for verification
                await sendMagicLink(email);
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
            return { data: result };
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
            return { data: result };
        }
    } catch (error) {
        console.error('Error saving petition:', error);
        return { error: 'An unexpected error occurred.' };
    }
} 