import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { CityMapTab } from '@/components/cities/map/CityMapTab';
import { getCityCached, getCityWithGeometryCached } from '@/lib/cache';
import { getGeneralSubjectsCached, getMapSubjectsCached, type MapSubjectFilters } from '@/lib/db/subject';
import { getRealm } from '@/lib/realm.server';

/** How far back a δήμος's map reaches by default. Wider than the landing's three months: one
 *  municipality produces far fewer subjects than a whole realm, so a year still reads as a map. */
const CITY_MAP_MONTHS = 12;

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

    const scoped = (extra: MapSubjectFilters): MapSubjectFilters => ({ cityIds: [cityId], ...extra });
    const recent = scoped({ monthsBack: CITY_MAP_MONTHS });
    let [subjects, generalRows] = await Promise.all([
        getMapSubjectsCached(realm, recent),
        getGeneralSubjectsCached(realm, recent),
    ]);

    // A δήμος whose council last met more than a year ago would otherwise get an empty map. Its
    // whole record is a better answer than nothing, and costs a second query only in that case.
    //
    // Both lists have to be empty. A δήμος can discuss plenty and locate none of it: the pins are
    // then empty while generalRows is not, and the map still has its city-hall marker and its list.
    // Widening on the pins alone replaced a current year with an old one for such a δήμος.
    if (subjects.length === 0 && generalRows.length === 0) {
        const all = scoped({ allTime: true });
        [subjects, generalRows] = await Promise.all([
            getMapSubjectsCached(realm, all),
            getGeneralSubjectsCached(realm, all),
        ]);
    }

    return (
        <CityMapTab
            cityId={cityId}
            subjects={subjects}
            generalRows={generalRows}
            geometry={city.geometry ?? null}
            moreHref={`/?city=${cityId}`}
        />
    );
}
