import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// Initialize PrismaClient
const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
    try {
        // Get request data
        const data = await req.json();
        const { cityId, name, isResident, isCitizen, email, phone } = data;

        if (!cityId || !name || !email) {
            return NextResponse.json(
                { error: 'City ID, name, and email are required' },
                { status: 400 }
            );
        }

        // Check if city exists
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
                    name,
                    phone,
                    allowContact: true,
                    onboarded: true,
                }
            });

            userId = newUser.id;
        }

        // Check if petition already exists
        const existingPetition = await prisma.Petition.findUnique({
            where: {
                userId_cityId: {
                    userId,
                    cityId
                }
            }
        });

        if (existingPetition) {
            // Update the existing petition
            await prisma.Petition.update({
                where: { id: existingPetition.id },
                data: {
                    is_resident: !!isResident,
                    is_citizen: !!isCitizen,
                }
            });
        } else {
            // Create a new petition
            await prisma.Petition.create({
                data: {
                    userId,
                    cityId,
                    is_resident: !!isResident,
                    is_citizen: !!isCitizen,
                }
            });
        }

        return NextResponse.json(
            {
                success: true,
                message: 'Petition submitted successfully',
            },
            { status: 201 }
        );

    } catch (error) {
        console.error('Error submitting petition:', error);

        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        );
    }
} 