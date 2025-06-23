import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getOrCreateUserFromRequest } from '@/lib/auth';
import { z } from 'zod';

const preferencesSchema = z.object({
    cityId: z.string(),
    locations: z.array(z.string()).optional(),
    topics: z.array(z.string()).optional(),
    email: z.string().email().optional(),
    name: z.string().optional(),
    phone: z.string().optional(),
});

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
    try {
        const json = await req.json();
        const data = preferencesSchema.parse(json);

        const user = await getOrCreateUserFromRequest(
            data.email,
            data.name,
            data.phone
        );

        if (!user) {
            return NextResponse.json(
                { error: 'Email is required to save preferences' },
                { status: 400 }
            );
        }
        
        const { cityId, locations, topics } = data;

        if (!cityId) {
            return NextResponse.json(
                { error: 'cityId is required' },
                { status: 400 }
            );
        }

        // Check if the city exists
        const city = await prisma.city.findUnique({
            where: { id: cityId }
        });

        if (!city) {
            return NextResponse.json(
                { error: 'City not found' },
                { status: 404 }
            );
        }

        // Check if notification preferences already exist for this user and city
        const existingPreference = await prisma.notificationPreference.findUnique({
            where: {
                userId_cityId: {
                    userId: user.id,
                    cityId
                }
            }
        });

        const locationConnections = locations && locations.length > 0
            ? { connect: locations.map((id: string) => ({ id })) }
            : undefined;

        const topicConnections = topics && topics.length > 0
            ? { connect: topics.map((id: string) => ({ id })) }
            : undefined;

        if (existingPreference) {
            // Update existing preferences
            await prisma.notificationPreference.update({
                where: { id: existingPreference.id },
                data: {
                    // Update relations with locations
                    locations: locationConnections ? {
                        set: [],
                        ...locationConnections
                    } : undefined,
                    // Update relations with topics
                    interests: topicConnections ? {
                        set: [],
                        ...topicConnections
                    } : undefined
                }
            });
        } else {
            // Create new preferences
            await prisma.notificationPreference.create({
                data: {
                    userId: user.id,
                    cityId,
                    // Connect locations if provided
                    locations: locationConnections,
                    // Connect topics if provided
                    interests: topicConnections
                }
            });
        }

        return NextResponse.json(
            {
                success: true,
                message: 'Notification preferences saved successfully'
            },
            { status: 201 }
        );
    } catch (error) {
        if (error instanceof z.ZodError) {
            return new NextResponse(JSON.stringify(error.issues), { status: 422 });
        }

        console.error('Error saving notification preferences:', error);

        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        );
    }
} 