import 'server-only';
import { getRealm } from '@/lib/realm.server';
import { searchRelatedSubjectsInRealm } from '@/lib/search/core';
import { getBatchStatisticsForSubjects } from '@/lib/statistics';
import { getPeopleForCityCached } from '@/lib/cache/queries';
import { subjectDisplayedSpeakers } from '@/lib/subjectSpeakers';
import type { PersonWithRelations } from '@/lib/db/people';
import type { RelatedSubjectSeed } from '@/lib/search/related';
import type { RelatedScope, SearchResultLight } from '@/lib/search/types';
import { RelatedSubjects, type RelatedLevel } from './RelatedSubjects';

/**
 * The related-subjects section, loaded on the server so the rows and their
 * links are in the page's HTML for crawlers and for readers without
 * JavaScript. Both levels load here, side by side; the client half only
 * switches between them. Renders nothing at all when neither level has a
 * subject, and a level that fails to load counts as empty: the search core
 * has already logged and alerted, and a recommendation list must not take
 * the page down with it.
 *
 * A row also needs the subject's speaking statistics and the people on its
 * avatar row. The search page's list container fetches those on the client,
 * which is exactly what would keep the rows out of the HTML, so they load
 * here too. Only the people a row shows travel to the client, not each
 * municipality's whole roster.
 */
export async function RelatedSubjectsSection({ seed, cityName }: { seed: RelatedSubjectSeed; cityName: string }) {
    const load = (scope: RelatedScope): Promise<SearchResultLight[]> =>
        searchRelatedSubjectsInRealm(seed, scope, getRealm).catch(() => []);
    const [city, other] = await Promise.all([load('city'), load('other')]);
    if (city.length === 0 && other.length === 0) return null;

    const all = [...city, ...other];
    const cityIds = [...new Set(all.map(subject => subject.cityId))];
    const [statistics, rosters] = await Promise.all([
        getBatchStatisticsForSubjects(all.map(subject => subject.id)),
        Promise.all(cityIds.map(async id => [id, await getPeopleForCityCached(id)] as const)),
    ]);
    const rosterByCity = new Map<string, PersonWithRelations[]>(rosters);

    const level = (subjects: SearchResultLight[]): RelatedLevel => {
        const withStatistics = subjects.map(subject => ({ ...subject, statistics: statistics.get(subject.id) }));
        const persons = new Map<string, PersonWithRelations>();
        for (const subject of withStatistics) {
            for (const person of subjectDisplayedSpeakers(subject, rosterByCity.get(subject.cityId) ?? [])) {
                persons.set(person.id, person);
            }
        }
        return { subjects: withStatistics, persons: [...persons.values()] };
    };

    return (
        <RelatedSubjects
            subjectId={seed.id}
            subjectName={seed.name}
            meetingId={seed.councilMeetingId}
            cityId={seed.cityId}
            cityName={cityName}
            levels={{ city: level(city), other: level(other) }}
        />
    );
}
