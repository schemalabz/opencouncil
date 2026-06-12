import { NextResponse } from 'next/server'
import { getCitiesForMap } from '@/lib/db/cities'
import { getPetitionCountsByCity } from '@/lib/db/petitions'

// Enable caching - revalidate every 1 hour
export const revalidate = 3600;

export async function GET() {
    try {
        const [cities, petitionCounts] = await Promise.all([
            getCitiesForMap(),
            getPetitionCountsByCity(),
        ]);

        const citiesWithPetitions = cities.map(city => ({
            ...city,
            petitionCount: petitionCounts[city.id] ?? 0,
        }));

        return NextResponse.json(citiesWithPetitions);
    } catch (error) {
        console.error('Error fetching cities for map:', error);
        return NextResponse.json({ error: 'Failed to fetch cities' }, { status: 500 });
    }
}
