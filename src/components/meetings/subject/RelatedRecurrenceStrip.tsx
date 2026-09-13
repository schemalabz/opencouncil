import 'server-only';
import type { RelatedSubjectSeed } from '@/lib/search/related';
import { loadRelatedNeighbours } from './relatedSubjectsData';
import { RelatedRecurrenceLink } from './RelatedRecurrenceLink';

/** Half a year either side of the meeting: close enough to read as one running matter. */
export const RECURRENCE_WINDOW_DAYS = 183;
/** One other discussion is a coincidence; two is a topic that keeps coming back. */
export const RECURRENCE_MIN_COUNT = 2;

/** The neighbours whose meeting falls within the window around `around`. */
export function recurringNeighbours<T extends { councilMeeting: { dateTime: Date | string } }>(
    neighbours: T[],
    around: Date,
): T[] {
    const windowMs = RECURRENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    return neighbours.filter(neighbour =>
        Math.abs(new Date(neighbour.councilMeeting.dateTime).getTime() - around.getTime()) <= windowMs,
    );
}

/**
 * One line under the page title, when the subject is a matter the
 * municipality keeps returning to: at least RECURRENCE_MIN_COUNT other
 * discussions of it within RECURRENCE_WINDOW_DAYS of this meeting. The
 * insight is that the topic recurs, so it is said where the reader starts,
 * and the line scrolls to the related section, which holds the detail. The
 * count is a floor, not a total: the lookup answers with the five best
 * matches, so the line says that the subject recurs, not how often.
 *
 * Only the same municipality counts. A neighbour elsewhere says nothing
 * about this council's agenda. Renders nothing below the floor, and nothing
 * when the lookup failed — the section's loader already treats that as
 * empty.
 */
export async function RelatedRecurrenceStrip({ seed, meetingDate }: { seed: RelatedSubjectSeed; meetingDate: string }) {
    const { city } = await loadRelatedNeighbours(seed);
    const count = recurringNeighbours(city, new Date(meetingDate)).length;
    if (count < RECURRENCE_MIN_COUNT) return null;

    return <RelatedRecurrenceLink subjectId={seed.id} cityId={seed.cityId} meetingId={seed.councilMeetingId} count={count} />;
}
