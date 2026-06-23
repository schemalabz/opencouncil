import { NextResponse } from 'next/server'
import { attachGeometryToCities } from '@/lib/db/cities'
import prisma from '@/lib/db/prisma'
import { createCache } from '@/lib/cache'
import { getRealm } from '@/lib/realm.server'

// Host-derived realm means the response varies per domain, so it can't use the
// URL-keyed route-segment cache (it would serve .gr data on .fr). Render
// dynamically and rely on the realm-keyed data-layer cache below instead.
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const realm = await getRealm();

        const citiesWithGeometry = await createCache(
            async () => {
                // Get cities for this realm - query with fields needed for map display
                const cities = await prisma.city.findMany({
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
                                councilMeetings: true
                            }
                        }
                    },
                    where: {
                        status: 'listed',
                        realm
                    },
                    orderBy: [
                        { status: 'desc' },
                        { name: 'asc' }
                    ]
                });

                // Enrich with geometry data
                return attachGeometryToCities(cities);
            },
            ['cities', 'map', realm],
            { tags: ['cities:all', `realm:${realm}:cities:all`] }
        )();

        return NextResponse.json(citiesWithGeometry);
    } catch (error) {
        console.error('Error fetching cities for map:', error);
        return NextResponse.json({ error: 'Failed to fetch cities' }, { status: 500 });
    }
}
