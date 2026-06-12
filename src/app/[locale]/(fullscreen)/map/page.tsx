import {
    getCitiesForMapCached,
    getDefaultMapSubjectsCached,
    getPetitionCountsByCityCached,
    getTopicsCached,
} from '@/lib/cache/queries';
import { getMapSubjects } from '@/lib/db/subject';
import { apiSubjectToMapSubject, cityToMapMunicipality } from '@/lib/map/adapters';
import { isDefaultFilter, parseMapFilterParams } from '@/lib/map/params';
import MapPageView from '@/components/map/MapPageView';

export default async function MapPage({
    searchParams,
}: {
    searchParams: Promise<{ topics?: string; months?: string }>;
}) {
    const filter = parseMapFilterParams(await searchParams);

    const [topics, cities, petitionCounts, apiSubjects] = await Promise.all([
        getTopicsCached(),
        getCitiesForMapCached(),
        getPetitionCountsByCityCached(),
        // Deep links with non-default filters bypass the cache (bounded key space)
        isDefaultFilter(filter)
            ? getDefaultMapSubjectsCached()
            : getMapSubjects({ monthsBack: filter.monthsBack, topicIds: filter.topicIds ?? undefined }),
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
