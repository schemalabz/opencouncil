import 'server-only';
import { getRealm } from '@/lib/realm.server';
import { searchRelatedSubjectsInRealm } from '@/lib/search/core';
import { getBatchStatisticsForSubjects, type Statistics } from '@/lib/statistics';
import { subjectSpeakersFromStatistics } from '@/lib/subjectSpeakers';
import type { PersonWithRelations } from '@/lib/db/people';
import type { RelatedSubjectSeed } from '@/lib/search/related';
import type { RelatedScope, SearchResultLight } from '@/lib/search/types';
import { RelatedSubjects, type RelatedLevel, type RelatedLevels } from './RelatedSubjects';

/**
 * Statistics for subjects that span meetings. The batch takes one meeting
 * date, and the date decides which of a speaker's roles were active — the
 * party dot a row draws — so the subjects are grouped by their meeting's
 * date and each group is asked for on its own.
 */
async function statisticsAcrossMeetings(subjects: SearchResultLight[]): Promise<Map<string, Statistics>> {
    const byDate = new Map<number, string[]>();
    for (const subject of subjects) {
        const date = new Date(subject.councilMeeting.dateTime).getTime();
        byDate.set(date, [...(byDate.get(date) ?? []), subject.id]);
    }
    const groups = await Promise.all(
        [...byDate].map(([date, ids]) => getBatchStatisticsForSubjects(ids, new Date(date))),
    );
    return new Map(groups.flatMap(group => [...group]));
}

/**
 * The related-subjects section, loaded on the server so the rows and their
 * links are in the page's HTML for crawlers and for readers without
 * JavaScript. Both levels load here, side by side; the client half only
 * switches between them. Renders nothing at all when neither level has a
 * subject, and a level that fails to load counts as empty: the search core
 * has already logged and alerted, and a recommendation list must not take
 * the page down with it. The statistics query has no such guard here; the
 * page wraps the section in an error boundary that hides it instead.
 *
 * A row also needs the subject's speaking statistics and the people on its
 * avatar row. The search page's list container fetches those on the client,
 * which is exactly what would keep the rows out of the HTML, so they load
 * here too. The statistics carry each speaker with their roles and the
 * hydration carries the introducer, so the avatar row needs no roster, and
 * only the people a row shows travel to the client.
 */
export async function RelatedSubjectsSection({ seed, cityName }: { seed: RelatedSubjectSeed; cityName: string }) {
    const load = (scope: RelatedScope): Promise<SearchResultLight[]> =>
        searchRelatedSubjectsInRealm(seed, scope, getRealm).catch(() => []);
    const [city, other] = await Promise.all([load('city'), load('other')]);
    if (city.length === 0 && other.length === 0) return null;

    const statistics = await statisticsAcrossMeetings([...city, ...other]);

    const level = (scope: RelatedScope, subjects: SearchResultLight[]): RelatedLevel => {
        const withStatistics = subjects.map(subject => ({ ...subject, statistics: statistics.get(subject.id) }));
        const persons = new Map<string, PersonWithRelations>();
        for (const subject of withStatistics) {
            for (const person of subjectSpeakersFromStatistics(subject.statistics, subject.introducedBy)) {
                persons.set(person.id, person);
            }
        }
        return { scope, subjects: withStatistics, persons: [...persons.values()] };
    };

    // Only the levels with subjects cross to the client, and at least one
    // does: the client never has to decide what an empty section shows.
    const levels = [level('city', city), level('other', other)].filter(l => l.subjects.length > 0);
    if (levels.length === 0) return null;

    return (
        <RelatedSubjects
            subjectId={seed.id}
            subjectName={seed.name}
            meetingId={seed.councilMeetingId}
            cityId={seed.cityId}
            cityName={cityName}
            levels={levels as RelatedLevels}
        />
    );
}
