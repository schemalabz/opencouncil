import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canUseCityCreator, getCity } from '@/lib/db/cities';
import { generateCityDataWithAI } from '@/lib/cityCreatorAI';
import { handleApiError } from '@/lib/api/errors';
import { cityPopulationAiRequestSchema } from '@/lib/zod-schemas/cityPopulation';

// POST: AI-powered city data population with streaming
export async function POST(request: NextRequest, props: { params: Promise<{ cityId: string }> }) {
    const params = await props.params;
    try {
        const user = await getCurrentUser();

        if (!user?.isSuperAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const city = await getCity(params.cityId);
        if (!city) {
            return NextResponse.json({ error: 'City not found' }, { status: 404 });
        }

        const canUseCreator = await canUseCityCreator(params.cityId);
        if (!canUseCreator) {
            return NextResponse.json({ error: 'City already has data' }, { status: 400 });
        }

        // Before the stream opens, so an invalid body answers 400 and the model is not called.
        // A body that is not JSON parses as null, which the schema refuses.
        const body = cityPopulationAiRequestSchema.parse(await request.json().catch(() => null));
        const userProvidedText = body.userProvidedText || undefined;

        const encoder = new TextEncoder();

        const stream = new TransformStream();
        const writer = stream.writable.getWriter();

        const streamResponse = new Response(stream.readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

        (async () => {
            const sendEvent = async (type: string, data: any) => {
                const message = `data: ${JSON.stringify({ type, ...data })}\n\n`;
                await writer.write(encoder.encode(message));
            };

            try {
                await sendEvent('status', {
                    message: 'Starting AI data generation...',
                    cityName: city.name
                });

                // Start heartbeat to keep connection alive during long AI operation
                const heartbeatInterval = setInterval(async () => {
                    try {
                        await sendEvent('heartbeat', {
                            message: 'AI is processing...',
                            timestamp: Date.now()
                        });
                    } catch (error) {
                        console.error('Heartbeat failed:', error);
                        clearInterval(heartbeatInterval);
                    }
                }, 10000); // Send heartbeat every 10 seconds

                let result;
                try {
                    result = await generateCityDataWithAI(params.cityId, city.name, {
                        useWebSearch: true,
                        webSearchMaxUses: 3,
                        userProvidedText,
                        language: city.language
                    });
                } finally {
                    // Always clear the heartbeat interval
                    clearInterval(heartbeatInterval);
                }

                if (!result.success) {
                    console.error('AI generation failed:', result.errors);
                    await sendEvent('error', {
                        error: 'Failed to generate city data with AI',
                        details: result.errors
                    });
                    await writer.close();
                    return;
                }

                console.log('AI generation successful, usage:', result.usage);

                await sendEvent('complete', {
                    success: true,
                    message: 'AI data generation completed',
                    data: result.data,
                    warnings: result.warnings ?? [],
                    usage: result.usage
                });

                await writer.close();
            } catch (error) {
                console.error('Error in AI data generation:', error);
                await sendEvent('error', {
                    error: 'Internal server error',
                    message: error instanceof Error ? error.message : String(error)
                });
                await writer.close();
            }
        })();

        return streamResponse;
    } catch (error) {
        return handleApiError(error, 'Internal server error');
    }
} 