import { NextResponse } from 'next/server';
import { env } from '@/env.mjs';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const placeId = searchParams.get('placeId');

    if (!placeId) {
        return NextResponse.json({ error: 'placeId parameter is required' }, { status: 400 });
    }

    try {
        // fetch, not axios: an AxiosError prints its request config, with the API key.
        const params = new URLSearchParams({
            place_id: placeId,
            fields: 'geometry,formatted_address,name,address_components',
            language: 'el',
            key: env.GOOGLE_API_KEY,
        });
        const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
        if (!response.ok) throw new Error(`Google Places details answered HTTP ${response.status}`);
        const data = await response.json();

        if (data.status !== 'OK') {
            console.error('Google Places Details API returned non-OK status:', data.status);
            return NextResponse.json({
                status: data.status,
                result: null
            });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching place details:', error);
        return NextResponse.json({
            status: 'ERROR',
            result: null
        });
    }
} 