import {
    getCitiesForMapCached,
    getDefaultMapSubjectsCached,
    getPetitionCountsByCityCached,
    getSubjectMetricsCached,
    getTopicsCached,
} from '@/lib/cache/queries';
import { getMapSubjects } from '@/lib/db/subject';
import { apiSubjectToMapSubject, cityToMapMunicipality } from '@/lib/map/adapters';
import { isDefaultFilter, parseMapFilterParams } from '@/lib/map/params';
import MapPageView from '@/components/map/MapPageView';

export default async function MapPage({
    searchParams,
}: {
    searchParams: Promise<{ topics?: string; months?: string; cities?: string; bodies?: string; from?: string; to?: string }>;
}) {
    const filter = parseMapFilterParams(await searchParams);

    const [topics, cities, petitionCounts, apiSubjects] = await Promise.all([
        getTopicsCached(),
        getCitiesForMapCached(),
        getPetitionCountsByCityCached(),
        // Deep links with non-default filters bypass the subjects cache (the
        // key space is unbounded) but still reuse the cached discussion metrics.
        isDefaultFilter(filter)
            ? getDefaultMapSubjectsCached()
            : getSubjectMetricsCached().then(metrics => getMapSubjects({
                monthsBack: filter.monthsBack,
                topicIds: filter.topicIds ?? undefined,
                cityIds: filter.cityIds ?? undefined,
                bodyTypes: filter.bodyTypes ?? undefined,
                dateFrom: filter.dateFrom ?? undefined,
                dateTo: filter.dateTo ?? undefined,
            }, metrics)),
    ]);

    const municipalities = cities.map(city => cityToMapMunicipality(city, petitionCounts[city.id] ?? 0));

    return (
        <MapPageView
            topics={topics}
            municipalities={municipalities}
            initialSubjects={apiSubjects.map(apiSubjectToMapSubject)}
            initialFilter={filter}
        />
    );
}
