import type { AdministrativeBodyType } from '@prisma/client';
import { getSubjectsForMeetingCached } from '@/lib/cache';
import { getBatchStatisticsForSubjects, type Statistics } from '@/lib/statistics';
import type { SubjectWithRelations } from '@/lib/db/subject';
import type { PersonWithRelations } from '@/lib/db/people';
import { getRecentHotSubjects, getHotSubjectsNearGeohash, type HotSubject } from '@/lib/hotSubjects';
import { subjectCardStats, type SubjectCardStats } from '@/lib/subjectCardStats';

export interface HotSubjectCard {
    subject: HotSubject['subject'];
    meeting: HotSubject['meeting'];
    /** Location text ("Χωρίς τοποθεσία" fallback applied at render). */
    locationText: string | null;
    /** Introducer first, then top speakers by speaking time — for the avatar row. */
    speakers: PersonWithRelations[];
    /** Footer stats (minutes / speaker count / party dots) — same shape the app card uses. */
    stats: SubjectCardStats;
}

interface Args {
    limit: number;
    administrativeBodyTypes?: AdministrativeBodyType[];
    administrativeBodyIds?: string[];
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
 */
export async function getHotSubjectCards(cityId: string, args: Args): Promise<HotSubjectCard[]> {
    const { geohash, ...filter } = args;
    const top = geohash
        ? await getHotSubjectsNearGeohash(cityId, geohash, filter)
        : await getRecentHotSubjects(cityId, filter);

    if (top.length === 0) return [];

    const meetingIds = [...new Set(top.map(t => t.meeting.id))];
    const [subjectLists, stats] = await Promise.all([
        Promise.all(meetingIds.map(meetingId => getSubjectsForMeetingCached(cityId, meetingId))),
        getBatchStatisticsForSubjects(top.map(t => t.subject.id)),
    ]);

    const fullById = new Map<string, SubjectWithRelations>();
    for (const list of subjectLists) {
        for (const subject of list) fullById.set(subject.id, subject);
    }

    return top.map(({ subject, meeting }) => {
        const full = fullById.get(subject.id);
        const statistics = stats.get(subject.id);
        return {
            subject,
            meeting,
            locationText: full?.location?.text ?? null,
            speakers: displayedSpeakers(statistics, full?.introducedBy ?? null),
            stats: subjectCardStats(statistics, subject._count?.contributions),
        };
    });
}
