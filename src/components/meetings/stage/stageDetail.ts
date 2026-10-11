import { formatClockTime, formatRelativeTime, formatShortDeadline } from '@/lib/formatters/time';
import { reviewDeadline, type PublicMeetingStage } from '@/lib/meetingStage';

type StageTranslate = (key: string, values?: Record<string, string | number>) => string;

/**
 * The chip's soft second half — how far away, since when, until when. Null
 * where the stage word says everything.
 */
export function stageChipDetail(
    t: StageTranslate,
    stage: PublicMeetingStage,
    dateTime: Date | string,
    timezone: string,
    locale: string,
    now: Date = new Date(),
): string | null {
    const date = new Date(dateTime);
    switch (stage) {
        case 'upcoming':
            // Against the caller's instant, not the clock: this runs on the
            // server and again on hydration, and two clocks gave two answers.
            return formatRelativeTime(date, locale, { now });
        case 'live':
            return t('detail.live', { time: formatClockTime(date, timezone, locale) });
        case 'review': {
            const deadline = reviewDeadline(date, now);
            return deadline ? t('detail.review', { deadline: formatShortDeadline(deadline, timezone, locale) }) : null;
        }
        case 'archive':
            return t('detail.archive');
        default:
            return null;
    }
}
