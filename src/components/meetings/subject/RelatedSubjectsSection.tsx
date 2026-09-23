import 'server-only';
import { getBatchStatisticsForSubjects, type Statistics } from '@/lib/statistics';
import type { RelatedSubjectSeed } from '@/lib/search/related';
import type { SearchResultLight } from '@/lib/search/types';
import { loadRelatedNeighbours } from './relatedSubjectsData';
import { RelatedSubjects, type RelatedCurrent, type RelatedLevel } from './RelatedSubjects';

/**
 * Statistics for subjects that span meetings. The batch takes one meeting
 * date, and the date decides which of a speaker's roles were active — the
 * party dot a row draws — so the subjects are grouped by their meeting's
 * date and each group is asked for on its own. A group that fails counts
 * as empty: a row without statistics is a state the row already renders,
 * and the rows and their links are what the section exists for.
 */
async function statisticsAcrossMeetings(subjects: SearchResultLight[]): Promise<Map<string, Statistics>> {
    const byDate = new Map<number, string[]>();
    for (const subject of subjects) {
        const date = new Date(subject.councilMeeting.dateTime).getTime();
        byDate.set(date, [...(byDate.get(date) ?? []), subject.id]);
    }
    const groups = await Promise.all(
        [...byDate].map(([date, ids]) =>
            getBatchStatisticsForSubjects(ids, new Date(date)).catch(() => new Map<string, Statistics>())),
    );
    return new Map(groups.flatMap(group => [...group]));
}

const byMeetingDate = (a: SearchResultLight, b: SearchResultLight) =>
    new Date(a.councilMeeting.dateTime).getTime() - new Date(b.councilMeeting.dateTime).getTime();

/**
 * The related-subjects section, loaded on the server so the rows and their
 * links are in the page's HTML for crawlers and for readers without
 * JavaScript. Both levels come from loadRelatedNeighbours, shared with the
 * header's recurrence strip, which treats a level that failed to load as
 * empty. Renders nothing at all when neither level has a subject. A
 * statistics group that fails leaves its rows without statistics: the rows
 * and their links are the point, and they stay.
 *
 * A row also needs the subject's speaking statistics, for its minutes, its
 * party dots and its avatar row: they carry each speaker with their roles,
 * and the hydration carries the introducer. The search page's list container
 * fetches statistics on the client, which is exactly what would keep the rows
 * out of the HTML, so they load here.
 */
export async function RelatedSubjectsSection({ seed, current }: { seed: RelatedSubjectSeed; current: RelatedCurrent }) {
    const { city, other } = await loadRelatedNeighbours(seed);
    if (city.length === 0 && other.length === 0) return null;

    const statistics = await statisticsAcrossMeetings([...city, ...other]);

    // A level crosses to the client only with subjects in it, so the client
    // never has to decide what an empty level shows.
    const level = (subjects: SearchResultLight[]): RelatedLevel | undefined =>
        subjects.length === 0
            ? undefined
            : { subjects: subjects.map(subject => ({ ...subject, statistics: statistics.get(subject.id) })) };

    // The same municipality's level is drawn as a timeline, so it reads in
    // meeting order; the other level keeps the index's order, closest first.
    return (
        <RelatedSubjects
            subjectId={seed.id}
            subjectName={seed.name}
            cityId={seed.cityId}
            current={current}
            city={level([...city].sort(byMeetingDate))}
            other={level(other)}
        />
    );
}
