import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
    try {
        // Get the request data
        const data = await req.json();
        const { email, phone, cityId, locations, topics } = data;

        if (!email || !cityId) {
            return NextResponse.json(
                { error: 'Email and cityId are required' },
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

        // Check if the user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        let userId;

        if (existingUser) {
            // If the user exists, use their ID
            userId = existingUser.id;

            // Update with phone if provided
            if (phone && !existingUser.phone) {
                await prisma.user.update({
                    where: { id: existingUser.id },
                    data: { phone }
                });
            }
        } else {
            // Create a new user
            const newUser = await prisma.user.create({
                data: {
                    email,
                    phone,
                    allowContact: true,
                    onboarded: true,
                }
            });

            userId = newUser.id;
        }

        // Check if notification preferences already exist for this user and city
        const existingPreference = await prisma.NotificationPreference.findUnique({
            where: {
                userId_cityId: {
                    userId,
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
            await prisma.NotificationPreference.update({
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
            await prisma.NotificationPreference.create({
                data: {
                    userId,
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
        console.error('Error saving notification preferences:', error);

        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        );
    }
} 