import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { CityMapTab } from '@/components/cities/map/CityMapTab';
import { getCityCached, getCityWithGeometryCached } from '@/lib/cache';
import { getGeneralSubjectsCached, getMapSubjectsCached, type MapSubjectFilters } from '@/lib/db/subject';
import { getRealm } from '@/lib/realm.server';

/**
 * How far back a δήμος's map reaches. Fixed, and the same three months the landing opens on.
 *
 * A tab has no room to argue about its own window, and a year of one δήμος put more on the map
 * than a reader can take in. Every other period, and every other filter, is the full map's job —
 * which the card's header band links to.
 */
const CITY_MAP_MONTHS = 3;

export async function generateMetadata(props: {
    params: Promise<{ locale: string; cityId: string }>;
}): Promise<Metadata> {
    const { locale, cityId } = await props.params;
    const [city, t] = await Promise.all([
        getCityCached(cityId),
        getTranslations({ locale, namespace: 'City' }),
    ]);
    if (!city) return {};
    return { title: `${t('map')} | ${city.name}` };
}

export default async function CityMapPage(props: { params: Promise<{ cityId: string }> }) {
    const { cityId } = await props.params;
    const [realm, city] = await Promise.all([getRealm(), getCityWithGeometryCached(cityId)]);
    if (!city) notFound();

    // No widening when the window comes up empty: a δήμος that has not met in three months says
    // so, and the header band is the way to the record that goes further back.
    const filters: MapSubjectFilters = { cityIds: [cityId], monthsBack: CITY_MAP_MONTHS };
    const [subjects, generalRows] = await Promise.all([
        getMapSubjectsCached(realm, filters),
        getGeneralSubjectsCached(realm, filters),
    ]);

    return (
        <CityMapTab
            cityId={cityId}
            subjects={subjects}
            generalRows={generalRows}
            geometry={city.geometry ?? null}
            months={CITY_MAP_MONTHS}
            moreHref={`/?city=${cityId}`}
        />
    );
}
