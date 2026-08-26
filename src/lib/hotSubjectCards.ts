import type { AdministrativeBody, AdministrativeBodyType, NonAgendaReason, Topic } from '@prisma/client';
import { createCache } from '@/lib/cache';
import { getBatchStatisticsForSubjects, type Statistics } from '@/lib/statistics';
import { getSubjectCardExtras } from '@/lib/db/subject';
import type { PersonWithRelations } from '@/lib/db/people';
import { computeRecentHotSubjects, getRecentHotSubjects, getHotSubjectsNearGeohash, type HotSubject } from '@/lib/hotSubjects';
import { subjectCardStats, type SubjectCardStats } from '@/lib/subjectCardStats';

/** The subject fields a card draws — not the row, which is mostly prose. */
export interface HotCardSubject {
    id: string;
    name: string;
    description: string;
    topic: Topic | null;
    /** Read only by getAgendaLabel, which the embed card shows. */
    agendaItemIndex: number | null;
    nonAgendaReason: NonAgendaReason | null;
}

/** The meeting fields a card draws, plus what its links are built from. */
export interface HotCardMeeting {
    cityId: string;
    id: string;
    name: string;
    name_en: string | null;
    /** An ISO string, not a Date, whenever the card set comes off a cache hit. */
    dateTime: Date;
    administrativeBody: AdministrativeBody | null;
}

/**
 * One card.
 *
 * `subject` and `meeting` are projections rather than the ranked records they
 * came from, and that is not only about row size. A ranked set draws several
 * cards from one meeting, and while the records are shared by reference the RSC
 * payload writes that meeting once. Caching the set round-trips it through JSON,
 * which breaks the sharing — so a full meeting would be written once per card,
 * with every subject of its agenda inside.
 */
export interface HotSubjectCard {
    subject: HotCardSubject;
    meeting: HotCardMeeting;
    /** Location text ("Χωρίς τοποθεσία" fallback applied at render). */
    locationText: string | null;
    /** Introducer first, then top speakers by speaking time — for the avatar row. */
    speakers: PersonWithRelations[];
    /** Footer stats (minutes / speaker count / party dots) — same shape the app card uses. */
    stats: SubjectCardStats;
}

/** Bump when the ranking or the card shape changes, so entries don't go stale. */
const HOT_CARDS_CACHE_VERSION = 'v2';

interface Args {
    limit: number;
    administrativeBodyTypes?: AdministrativeBodyType[];
    administrativeBodyIds?: string[];
    /** How far back to rank. Omitted means the last few meetings. */
    months?: number;
    geohash?: string | null;
}

/** Introducer (if any) + up to 5 top speakers by speaking time. */
function displayedSpeakers(statistics: Statistics | undefined, introducedBy: PersonWithRelations | null): PersonWithRelations[] {
    const ranked = [...(statistics?.people ?? [])]
        .sort((a, b) => b.speakingSeconds - a.speakingSeconds)
        .slice(0, 5)
        .map(p => p.item);
    if (!introducedBy) return ranked;
    return [introducedBy, ...ranked.filter(s => s.id !== introducedBy.id)];
}

/**
 * Hydrate the ranked top-N hot subjects with just what the card's location row
 * and avatar row need — location text and the top speakers — for the displayed
 * subjects only. Statistics already carry full person objects, so no city-wide
 * roster is loaded, and only the ~5 speakers per card cross to the client.
 *
 * Both queries here are uncached, so this is safe to call inside createCache.
 */
async function buildCards(top: HotSubject[]): Promise<HotSubjectCard[]> {
    if (top.length === 0) return [];

    const subjectIds = top.map(t => t.subject.id);
    const [extras, stats] = await Promise.all([
        getSubjectCardExtras(subjectIds),
        getBatchStatisticsForSubjects(subjectIds),
    ]);

    return top.map(({ subject, meeting }) => {
        const extra = extras.get(subject.id);
        const statistics = stats.get(subject.id);
        return {
            subject: {
                id: subject.id,
                name: subject.name,
                description: subject.description,
                topic: subject.topic,
                agendaItemIndex: subject.agendaItemIndex,
                nonAgendaReason: subject.nonAgendaReason,
            },
            meeting: {
                cityId: meeting.cityId,
                id: meeting.id,
                name: meeting.name,
                name_en: meeting.name_en,
                dateTime: meeting.dateTime,
                administrativeBody: meeting.administrativeBody,
            },
            locationText: extra?.locationText ?? null,
            speakers: displayedSpeakers(statistics, extra?.introducedBy ?? null),
            stats: subjectCardStats(statistics, subject._count?.contributions),
        };
    });
}

/**
 * Uncached: the ranking it builds on is cached per geohash, and the embed that
 * uses it has its own page cache and an unbounded coordinate space behind it.
 */
export async function getHotSubjectCards(cityId: string, args: Args): Promise<HotSubjectCard[]> {
    const { geohash, ...filter } = args;
    const top = geohash
        ? await getHotSubjectsNearGeohash(cityId, geohash, filter)
        : await getRecentHotSubjects(cityId, filter);
    return buildCards(top);
}

/**
 * The city overview's variant: one cache entry for the whole card set.
 *
 * Uncached, this ran the ranking's statistics query and the card hydration on
 * every request — the page's only remaining per-request database work once the
 * meeting queries were cached. No geohash dimension, so the key space stays at
 * cities × body filters.
 */
export async function getHotSubjectCardsCached(cityId: string, args: Omit<Args, 'geohash'>): Promise<HotSubjectCard[]> {
    const { limit, administrativeBodyTypes, administrativeBodyIds, months } = args;
    const typeKey = administrativeBodyTypes?.length ? `types:${[...administrativeBodyTypes].sort().join(',')}` : 'types:all';
    const idKey = administrativeBodyIds?.length ? `ids:${[...administrativeBodyIds].sort().join(',')}` : 'ids:all';
    return createCache(
        async () => buildCards(await computeRecentHotSubjects(cityId, args)),
        // `months`, not the date it resolves to: the window moves with `now`, and
        // the TTL below is what bounds that drift.
        ['city', cityId, 'hotSubjectCards', HOT_CARDS_CACHE_VERSION, `limit:${limit}`, typeKey, idKey, `months:${months ?? 'default'}`],
        {
            tags: ['city', `city:${cityId}`, `city:${cityId}:meetings`],
            // The ranking window is the last N *past* meetings, which is a
            // function of `now` that no tag can express.
            revalidate: 900,
        }
    )();
}
