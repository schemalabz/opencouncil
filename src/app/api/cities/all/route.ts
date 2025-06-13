import { NextResponse } from 'next/server';
import { getAllCitiesMinimal } from '@/lib/db/cities';

export async function GET() {
    try {
        const cities = await getAllCitiesMinimal();
        
        return NextResponse.json(cities);
    } catch (error) {
        console.error('Error fetching all cities minimal:', error);
        
        return NextResponse.json(
            { error: 'Failed to fetch cities' },
            { status: 500 }
        );
    }
} 