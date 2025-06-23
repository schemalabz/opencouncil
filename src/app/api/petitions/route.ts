import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getOrCreateUserFromRequest } from '@/lib/auth';
import { z } from 'zod';

const petitionSchema = z.object({
    cityId: z.string(),
    isResident: z.boolean().optional(),
    isCitizen: z.boolean().optional(),
    email: z.string().email().optional(),
    name: z.string().optional(),
    phone: z.string().optional(),
});

// Initialize PrismaClient
const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
    try {
        const json = await req.json();
        const data = petitionSchema.parse(json);
        const user = await getOrCreateUserFromRequest(
            data.email,
            data.name,
            data.phone
        );

        if (!user) {
            return NextResponse.json(
                { error: 'Email is required to submit a petition' },
                { status: 400 }
            );
        }

        const { cityId, isResident, isCitizen } = data;

        if (!cityId) {
            return NextResponse.json(
                { error: 'City ID is required' },
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

        // Check if petition already exists
        const existingPetition = await prisma.petition.findUnique({
            where: {
                userId_cityId: {
                    userId: user.id,
                    cityId
                }
            }
        });

        if (existingPetition) {
            // Update the existing petition
            await prisma.petition.update({
                where: { id: existingPetition.id },
                data: {
                    is_resident: !!isResident,
                    is_citizen: !!isCitizen,
                }
            });
        } else {
            // Create a new petition
            await prisma.petition.create({
                data: {
                    userId: user.id,
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
        if (error instanceof z.ZodError) {
            return new NextResponse(JSON.stringify(error.issues), { status: 422 });
        }
        
        console.error('Error submitting petition:', error);

        return NextResponse.json(
            { error: 'An unexpected error occurred' },
            { status: 500 }
        );
    }
} 