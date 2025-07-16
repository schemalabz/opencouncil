import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canUseCityCreator, getCity } from '@/lib/db/cities';
import { generateCityDataWithAI } from '@/lib/cityCreatorAI';

// POST: AI-powered city data population with streaming
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

        // Create a streaming response
        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();

                const sendEvent = (type: string, data: any) => {
                    const message = `data: ${JSON.stringify({ type, ...data })}\n\n`;
                    controller.enqueue(encoder.encode(message));
                };

                try {
                    // Send initial status
                    sendEvent('status', {
                        message: 'Starting AI data generation...',
                        cityName: city.name
                    });

                    // Generate data using AI with web search
                    const result = await generateCityDataWithAI(params.cityId, city.name, {
                        useWebSearch: true,
                        webSearchMaxUses: 10
                    });

                    if (!result.success) {
                        console.error('AI generation failed:', result.errors);
                        sendEvent('error', {
                            error: 'Failed to generate city data with AI',
                            details: result.errors
                        });
                        controller.close();
                        return;
                    }

                    console.log('AI generation successful, usage:', result.usage);

                    // Send success with data
                    sendEvent('complete', {
                        success: true,
                        message: 'AI data generation completed',
                        data: result.data,
                        usage: result.usage
                    });

                    controller.close();
                } catch (error) {
                    console.error('Error in AI data generation:', error);
                    sendEvent('error', {
                        error: 'Internal server error',
                        message: error instanceof Error ? error.message : String(error)
                    });
                    controller.close();
                }
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    } catch (error) {
        console.error('Error in AI data generation route:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
} 