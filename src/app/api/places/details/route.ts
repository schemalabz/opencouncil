import { NextResponse } from 'next/server';
import axios from 'axios';
import { env } from '@/env.mjs';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const placeId = searchParams.get('placeId');

    if (!placeId) {
        return NextResponse.json({ error: 'placeId parameter is required' }, { status: 400 });
    }

    try {
        const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
            params: {
                place_id: placeId,
                fields: 'geometry,formatted_address,name,address_components',
                language: 'el',
                key: env.GOOGLE_API_KEY
            }
        });

        if (response.data.status !== 'OK') {
            console.error('Google Places Details API returned non-OK status:', response.data.status);
            return NextResponse.json({
                status: response.data.status,
                result: null
            });
        }

        return NextResponse.json(response.data);
    } catch (error) {
        console.error('Error fetching place details:', error);
        return NextResponse.json({
            status: 'ERROR',
            result: null
        });
    }
} 