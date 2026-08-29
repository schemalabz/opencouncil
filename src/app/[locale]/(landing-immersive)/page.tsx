import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LandingV2 } from '@/components/landing/v2/LandingV2';
import { buildCanonicalAlternates } from '@/lib/utils/hreflang';
import { getOgLocale } from '@/i18n/config';
import { buildOgImageUrl } from '@/lib/og/locale';
import { getRealm } from '@/lib/realm.server';
import { getRealmDefaultMapView } from '@/lib/realm';
import { getMapSubjectsCached, getGeneralSubjectsCached, getSubjectCountsByCityCached } from '@/lib/db/subject';
import { getListedCitiesCached, getMapCitiesCached, getPetitionedMapCitiesCached } from '@/lib/db/cities';
import { getUpcomingMeetingsCached } from '@/lib/db/meetings';
import { DEFAULT_RANGE, rangeToSubjectFilters } from '@/lib/landing/landingCore';
import { toLandingSubjectPreview } from '@/lib/landing/payload';

export async function generateMetadata(props: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await props.params;
    const t = await getTranslations({ locale, namespace: 'metadata.landing' });

    const title = t('title');
    const description = t('description');
    // Without this the root layout's static square logo is what every share of
    // the bare domain unfurls, in Greek on every realm.
    const ogImageUrl = buildOgImageUrl(locale, { pageType: 'landing' });

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            type: 'website',
            siteName: 'OpenCouncil',
            locale: getOgLocale(locale),
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: t('ogAlt'),
                },
            ],
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: [ogImageUrl],
            creator: '@opencouncil',
            site: '@opencouncil',
        },
        alternates: await buildCanonicalAlternates(''),
    };
}

export default async function HomePage() {
    const realm = await getRealm();
    const initialFilters = rangeToSubjectFilters(DEFAULT_RANGE);

    const [subjects, generalRows, cities, upcoming, subjectCountByCity, mapCities, petitioned] = await Promise.all([
        getMapSubjectsCached(realm, initialFilters),
        getGeneralSubjectsCached(realm, initialFilters),
        getListedCitiesCached(realm),
        getUpcomingMeetingsCached(realm),
        getSubjectCountsByCityCached(realm),
        getMapCitiesCached(realm),
        getPetitionedMapCitiesCached(realm),
    ]);

    return (
        <LandingV2
            realm={realm}
            defaultView={getRealmDefaultMapView(realm)}
            initial={{
                // Cards never render the full transcript-linked markdown. Serialize a bounded
                // plain-text preview instead, while cached DB rows retain their full descriptions.
                subjects: subjects.map(toLandingSubjectPreview),
                generalRows: generalRows.map((row) => ({
                    ...row,
                    subjects: row.subjects.map(toLandingSubjectPreview),
                })),
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
                petitionedCities: petitioned.cities,
                petitionedBelowThreshold: petitioned.belowThresholdCount,
            }}
        />
    );
}
