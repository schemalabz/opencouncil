import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { canUseCityCreator, getCity } from '@/lib/db/cities';
import { cityPopulationSchema, populateCity, requireEmptyCity } from '@/lib/db/cityPopulate';
import { ApiError } from '@/lib/api/errors';
import { revalidateTag } from 'next/cache';

// GET: Load initial empty structure
export async function GET(request: NextRequest, props: { params: Promise<{ cityId: string }> }) {
    const params = await props.params;
    try {
        const user = await getCurrentUser();

        if (!user?.isSuperAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if city can use city creator
        const canUseCreator = await canUseCityCreator(params.cityId);
        if (!canUseCreator) {
            // Check if city exists to provide appropriate error message
            const city = await getCity(params.cityId);
            if (!city) {
                return NextResponse.json({ error: 'City not found' }, { status: 404 });
            }
            return NextResponse.json({ error: 'City already has data' }, { status: 400 });
        }

        // Return empty council structure
        const emptyCouncilStructure = {
            cityId: params.cityId,
            parties: [],
            administrativeBodies: [
                {
                    name: "Δημοτικό Συμβούλιο",
                    name_en: "Municipal Council",
                    type: "council" as const,
                },
            ],
            people: [],
            roles: [],
        };

        return NextResponse.json(emptyCouncilStructure);
    } catch (error) {
        console.error('Error loading initial data:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST: Save city data
export async function POST(request: NextRequest, props: { params: Promise<{ cityId: string }> }) {
    const params = await props.params;
    try {
        const user = await getCurrentUser();

        if (!user?.isSuperAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Before the body is read, so a city with data answers 400 whatever was sent.
        await requireEmptyCity(params.cityId);

        const body = await request.json();
        const validatedData = cityPopulationSchema.parse(body);

        const result = await populateCity(params.cityId, validatedData);

        try {
            revalidateTag(`city:${params.cityId}`, 'max');
        } catch (error) {
            console.error('Error revalidating city:', error);
        }

        return NextResponse.json({
            success: true,
            message: 'City data saved successfully',
            stats: result,
        });
    } catch (error) {
        console.error('Error saving city data:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json({
                error: 'Invalid data format',
                details: error.errors
            }, { status: 400 });
        }

        if (error instanceof ApiError) {
            return NextResponse.json({ error: error.message }, { status: error.statusCode });
        }

        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
