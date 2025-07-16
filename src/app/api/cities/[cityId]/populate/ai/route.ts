import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canUseCityCreator, getCity } from '@/lib/db/cities';
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

        // Get city for AI generation (we know it exists from canUseCityCreator check)
        const city = await getCity(params.cityId);
        if (!city) {
            // This should never happen after canUseCityCreator check, but TypeScript safety
            return NextResponse.json({ error: 'City not found' }, { status: 404 });
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