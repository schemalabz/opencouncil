import type { SubjectImageBackfillRow } from '@/lib/db/subject';
import { rankAndSortSubjects, type RankableSubject } from '@/lib/ranking/subjects';

/**
 * The landing's importance order, for the image backfill: the same ranker and
 * the same signals the landing list feeds it (recency, discussion minutes,
 * small-municipality lift, body tier, a located tiebreaker), so `--limit N`
 * draws the N subjects a visitor is most likely to see first.
 */
const toRankable = (row: SubjectImageBackfillRow): RankableSubject => ({
    cityId: row.cityId,
    meetingDate: row.meetingDate,
    discussionSignal: row.discussionSeconds / 60,
    adminBodyType: row.adminBodyType,
    hasLocation: row.hasLocation,
});

export function rankSubjectIdsForImages(rows: SubjectImageBackfillRow[]): string[] {
    return rankAndSortSubjects(rows, toRankable).map((ranking) => ranking.item.id);
}
