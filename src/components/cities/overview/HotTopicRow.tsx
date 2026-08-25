import { useTranslations } from 'next-intl';
import type { HotSubjectCard } from '@/lib/hotSubjectCards';
import { formatDate } from '@/lib/formatters/time';
import { localizeText } from '@/lib/serbian';
import { topicStyle } from '@/lib/topicStyle';
import { hotTopicBarWidth } from '@/lib/utils/subjects';
import { AdminBodyLabel } from './AdminBodyLabel';

interface HotTopicRowProps {
    card: HotSubjectCard;
    /** Position in the ranking, 1-based. */
    rank: number;
    /** Longest debate in the list — the scale every bar is drawn against. */
    maxSeconds: number;
    timezone: string;
    locale: string;
    /** Opens this row in place. */
    onOpen: () => void;
}

/**
 * One subject below the leader.
 *
 * The row is its own bar: a tinted band behind the content, as wide a fraction
 * of the row as the subject's debate time is of the longest in the list. A
 * separate bar element would compete with the title for the same horizontal
 * space, and at this density there is no room for both.
 *
 * The scale is the list maximum rather than the leader's own time, because the
 * ranking is a blend — recency and which body took the subject up both count —
 * so the top entry is not always the longest debate. Measuring against the
 * leader would push those bars past full width and quietly clamp them.
 *
 * No avatars here — they would put a handful of full person records per row into
 * the payload for a list that is read as a ranking, not as a set of profiles.
 */
export function HotTopicRow({ card, rank, maxSeconds, timezone, locale, onOpen }: HotTopicRowProps) {
    const t = useTranslations('cityOverview');
    const { subject, meeting, stats } = card;
    const topic = topicStyle(subject.topic?.colorHex);
    const width = hotTopicBarWidth(stats.speakingSeconds, maxSeconds);

    return (
        <button
            type="button"
            onClick={onOpen}
            aria-expanded={false}
            className="relative flex w-full items-center gap-3 overflow-hidden border-t border-border px-4 py-3 text-left transition-colors hover:bg-muted/30"
        >
            <span
                className="absolute inset-y-0 left-0 z-0"
                style={{ width: `${width}%`, backgroundColor: topic.background, opacity: 0.5 }}
                aria-hidden
            />
            <span className="relative z-10 w-6 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">
                {String(rank).padStart(2, '0')}
            </span>
            <span
                className="relative z-10 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: topic.border }}
                aria-hidden
            />
            <span className="relative z-10 min-w-0 flex-1">
                <span className="block truncate text-[15px] leading-snug">
                    {localizeText(subject.name, locale)}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <AdminBodyLabel body={meeting.administrativeBody} locale={locale} className="text-[11px]" />
                    <span aria-hidden>·</span>
                    <span>{formatDate(meeting.dateTime, timezone, locale)}</span>
                    <span aria-hidden>·</span>
                    <span>{t('speakerCount', { count: stats.speakerCount })}</span>
                </span>
            </span>
            <span className="relative z-10 shrink-0 text-sm font-bold tabular-nums">
                {t('discussionMinutes', { minutes: stats.minutes })}
            </span>
        </button>
    );
}
