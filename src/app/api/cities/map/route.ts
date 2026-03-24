import { NextResponse } from 'next/server'
import { attachGeometryToCities } from '@/lib/db/cities'
import prisma from '@/lib/db/prisma'

// Enable 1-hour caching for production as city geometries change rarely
export const revalidate = 3600;

export async function GET() {
    try {
        // Get ONLY listed cities for the public map
        const cities = await prisma.city.findMany({
            where: {
                status: 'listed'
            },
            select: {
                id: true,
                name: true,
                name_en: true,
                name_municipality: true,
                name_municipality_en: true,
                logoImage: true,
                timezone: true,
                createdAt: true,
                updatedAt: true,
                officialSupport: true,
                status: true,
                authorityType: true,
                wikipediaId: true,
                supportsNotifications: true,
                consultationsEnabled: true,
                peopleOrdering: true,
                highlightCreationPermission: true,
                _count: {
                    select: {
                        councilMeetings: true,
                        petitions: true
                    }
                }
            },
            orderBy: [
                { name: 'asc' }
            ]
        });

        // Enrich with geometry data
        const citiesWithGeometry = await attachGeometryToCities(cities);

        return NextResponse.json(citiesWithGeometry);
    } catch (error) {
        console.error('Error fetching cities for map:', error);
        return NextResponse.json({ error: 'Failed to fetch cities' }, { status: 500 });
    }
}

