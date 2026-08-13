import { NextResponse } from 'next/server';
import { getAllCitiesMinimal } from '@/lib/db/cities';
import { isCustomer } from '@/lib/cityStatus';

export async function GET() {
    try {
        const cities = await getAllCitiesMinimal();

        // `officialSupport` is derived here rather than in CityMinimalWithCounts,
        // which stays a faithful Pick of the model. Its meaning survived the move
        // to CityStatus unchanged, so third parties keep the field they have.
        return NextResponse.json(
            cities.map((city) => ({ ...city, officialSupport: isCustomer(city.status) })),
        );
    } catch (error) {
        console.error('Error fetching all cities minimal:', error);
        
        return NextResponse.json(
            { error: 'Failed to fetch cities' },
            { status: 500 }
        );
    }
} 