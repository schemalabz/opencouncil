import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getCity } from '@/lib/db/cities';
import prisma from '@/lib/db/prisma';
import { generateCityDataWithAI } from '@/lib/cityCreatorAI';

// POST: AI-powered city data population
export async function POST(
    request: NextRequest,
    { params }: { params: { cityId: string } }
) {
    try {
        const user = await getCurrentUser();

        if (!user?.isSuperAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const city = await getCity(params.cityId);
        if (!city) {
            return NextResponse.json({ error: 'City not found' }, { status: 404 });
        }

        if (!city.isPending) {
            return NextResponse.json({ error: 'City is not pending' }, { status: 400 });
        }

        // Check if city has any existing data
        const existingData = await prisma.city.findUnique({
            where: { id: params.cityId },
            include: {
                parties: true,
                persons: true,
                councilMeetings: true,
                roles: true,
            },
        });

        if (existingData && (
            existingData.parties.length > 0 ||
            existingData.persons.length > 0 ||
            existingData.councilMeetings.length > 0 ||
            existingData.roles.length > 0
        )) {
            return NextResponse.json({ error: 'City already has data' }, { status: 400 });
        }

        // Generate data using AI with web search
        const result = await generateCityDataWithAI(params.cityId, city.name, {
            useWebSearch: true,
            webSearchMaxUses: 10
        });

        if (!result.success) {
            console.error('AI generation failed:', result.errors);
            return NextResponse.json(
                {
                    error: 'Failed to generate city data with AI',
                    details: result.errors
                },
                { status: 500 }
            );
        }

        console.log('AI generation successful, usage:', result.usage);

        return NextResponse.json({
            success: true,
            message: 'AI data generation completed',
            data: result.data,
            usage: result.usage
        });
    } catch (error) {
        console.error('Error in AI data generation:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
} 