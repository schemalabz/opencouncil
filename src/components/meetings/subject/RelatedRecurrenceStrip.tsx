import 'server-only';
import type { RelatedSubjectSeed } from '@/lib/search/related';
import { loadRelatedNeighbours } from './relatedSubjectsData';
import { RelatedRecurrenceLink } from './RelatedRecurrenceLink';

/**
 * Half a year either side of the meeting: close enough to read as one running
 * matter. `relatedRecurring` in the four message catalogs says "six months"
 * for this window; change the two together.
 */
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
 * One line under the page title, when the municipality has at least
 * RECURRENCE_MIN_COUNT similar subjects within RECURRENCE_WINDOW_DAYS of this
 * meeting, before or after it. The line is a pointer to the related section,
 * which holds the dates, and it says only what the lookup can support: the
 * lookup finds similar subjects, not the same subject returning — a council
 * appoints a representative to many companies, and each is its own matter —
 * so the line does not say "again". The count is a floor, not a total: the
 * lookup answers with the five best matches.
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
