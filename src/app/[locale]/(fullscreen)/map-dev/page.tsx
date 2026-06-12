import { notFound } from 'next/navigation';
import { DEV_TOOLS_ALLOWED } from '@/lib/utils';
import { getCitiesForMapCached, getPetitionCountsByCityCached } from '@/lib/cache/queries';
import { getMapSubjects } from '@/lib/db/subject';
import { apiSubjectToMapSubject, cityToMapMunicipality } from '@/lib/map/adapters';
import MapDevView from './MapDevView';

/**
 * DEV-ONLY harness for the CivicMap suite — exercised while the redesigned
 * /map page is under construction. Deleted before the branch ships.
 */
export default async function MapDevPage() {
    if (!DEV_TOOLS_ALLOWED) notFound();

    const [cities, petitionCounts, apiSubjects] = await Promise.all([
        getCitiesForMapCached(),
        getPetitionCountsByCityCached(),
        getMapSubjects(), // uncached on purpose — the harness wants fresh data
    ]);

    // Every dev city is officially supported and has zero petitions, so
    // synthetically flip a few to "petitioned" — one per heat-ramp bucket —
    // to exercise the municipalities layer while developing.
    const syntheticPetitions: Record<string, number> = {
        chalandri: 0,
        vrilissia: 3,
        zografou: 12,
        xylokastro: 25,
        orestiada: 60,
        samothraki: 110,
    };

    const municipalities = cities.map(city => {
        const synthetic = syntheticPetitions[city.id];
        return cityToMapMunicipality(
            synthetic !== undefined ? { ...city, officialSupport: false } : city,
            petitionCounts[city.id] ?? synthetic ?? 0,
        );
    });

    return <MapDevView municipalities={municipalities} subjects={apiSubjects.map(apiSubjectToMapSubject)} />;
}
