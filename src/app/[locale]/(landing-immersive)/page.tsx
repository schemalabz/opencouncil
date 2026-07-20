import { Metadata } from 'next';
import { LandingV2 } from '@/components/landing/v2/LandingV2';
import { buildCanonicalAlternates } from '@/lib/utils/hreflang';
import { getRealm } from '@/lib/realm.server';
import { getRealmDefaultMapView } from '@/lib/realm';
import { getMapSubjectsCached, getGeneralSubjectsCached, getSubjectCountsByCityCached } from '@/lib/db/subject';
import { getListedCitiesCached, getMapCitiesCached } from '@/lib/db/cities';
import { getUpcomingMeetingsCached } from '@/lib/db/meetings';
import { DEFAULT_RANGE, rangeToSubjectFilters } from '@/lib/landing/landingCore';

export async function generateMetadata(): Promise<Metadata> {
    return {
        alternates: await buildCanonicalAlternates(''),
    };
}

export default async function HomePage() {
    const realm = await getRealm();
    const initialFilters = rangeToSubjectFilters(DEFAULT_RANGE);

    const [subjects, generalRows, cities, upcoming, subjectCountByCity, mapCities] = await Promise.all([
        getMapSubjectsCached(realm, initialFilters),
        getGeneralSubjectsCached(realm, initialFilters),
        getListedCitiesCached(realm),
        getUpcomingMeetingsCached(realm),
        getSubjectCountsByCityCached(realm),
        getMapCitiesCached(realm),
    ]);

    return (
        <LandingV2
            defaultView={getRealmDefaultMapView(realm)}
            initial={{
                subjects,
                generalRows,
                cities: cities.map((c) => ({
                    id: c.id,
                    name: c.name,
                    name_en: c.name_en,
                    name_municipality: c.name_municipality,
                    logoImage: c.logoImage,
                    _count: c._count,
                })),
                // Serialize the meeting rows to the client wire shape. `new Date(...)` because
                // getUpcomingMeetingsCached round-trips through unstable_cache, which hands back
                // dateTime as a string on a cache hit (a Date only on the miss).
                upcoming: upcoming.map((m) => ({
                    id: m.id,
                    cityId: m.cityId,
                    name: m.name,
                    dateTime: new Date(m.dateTime).toISOString(),
                    city: {
                        id: m.city.id,
                        name: m.city.name,
                        name_municipality: m.city.name_municipality,
                        logoImage: m.city.logoImage,
                    },
                    administrativeBody: m.administrativeBody ? { name: m.administrativeBody.name } : null,
                })),
                subjectCountByCity,
                mapCities,
            }}
        />
    );
}
