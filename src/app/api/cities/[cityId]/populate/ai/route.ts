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

        const city = await getCity(params.cityId);
        if (!city) {
            return NextResponse.json({ error: 'City not found' }, { status: 404 });
        }

        const canUseCreator = await canUseCityCreator(params.cityId);
        if (!canUseCreator) {
            return NextResponse.json({ error: 'City already has data' }, { status: 400 });
        }

        let userProvidedText: string | undefined;
        try {
            const body = await request.json();
            userProvidedText = body.userProvidedText?.trim() || undefined;
        } catch (error) {
            userProvidedText = undefined;
        }

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

                const result = await generateCityDataWithAI(params.cityId, city.name, {
                    useWebSearch: true,
                    webSearchMaxUses: 3,
                    userProvidedText
                });

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
        console.error('Error in AI data generation route:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
} 