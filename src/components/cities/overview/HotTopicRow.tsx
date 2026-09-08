import { useTranslations } from 'next-intl';
import type { HotSubjectCard } from '@/lib/hotSubjectCards';
import { formatDate } from '@/lib/formatters/time';
import { localizeText } from '@/lib/serbian';
import { FactDot } from '@/components/ui/fact-dot';
import { TopicIcon } from '@/components/TopicIcon';
import { topicStyle } from '@/lib/topicStyle';
import { cn } from '@/lib/utils';
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
 * The tinted band behind a hot-topic entry, as wide a fraction of the entry as
 * the subject's debate time is of the longest in the list.
 *
 * The entry is its own bar rather than carrying a separate one, because a bar
 * element would compete with the title for the same horizontal space and at
 * this density there is no room for both. Both the leader and the rows below it
 * draw it, so they are read against the same scale.
 */
export function HotTopicBar({ width, background }: { width: number; background: string }) {
    return (
        <span
            className="absolute inset-y-0 left-0 z-0"
            style={{ width: `${width}%`, backgroundColor: background, opacity: 0.5 }}
            aria-hidden
        />
    );
}

/** An entry's place in the ranking, padded so single digits hold the column. */
export function HotTopicRank({ rank, className }: { rank: number; className?: string }) {
    return (
        <span className={cn('w-6 shrink-0 text-xs font-bold tabular-nums text-muted-foreground', className)}>
            {String(rank).padStart(2, '0')}
        </span>
    );
}

/** `sm` for a row under the leader, `md` for the leader itself. */
const FACTS_SIZES = {
    sm: { line: 'mt-1 gap-x-2 gap-y-0.5 text-[11px]', body: 'text-[11px]' },
    md: { line: 'mt-2 gap-x-2.5 gap-y-1 text-xs', body: undefined },
} as const;

/**
 * Which body took the subject up, when, and how many people spoke — the line
 * every hot-topic entry carries under its title.
 *
 * The debate time keeps its own column where there is width for one. On a phone
 * that column took two thirds of the title, so it joins the facts here instead —
 * still the loudest of them, since it is what the list is ranked on.
 */
export function HotTopicFacts({ card, timezone, locale, size }: {
    card: HotSubjectCard;
    timezone: string;
    locale: string;
    size: keyof typeof FACTS_SIZES;
}) {
    const t = useTranslations('cityOverview');
    const { meeting, stats } = card;
    const sizing = FACTS_SIZES[size];

    // A span rather than a div: a row mounts this inside its <button>.
    return (
        <span className={cn('flex flex-wrap items-center text-muted-foreground', sizing.line)}>
            <span className="font-bold text-foreground sm:hidden">
                {t('discussionMinutes', { minutes: stats.minutes })}
            </span>
            <FactDot className="sm:hidden" />
            <AdminBodyLabel body={meeting.administrativeBody} locale={locale} className={sizing.body} />
            <FactDot />
            <span>{formatDate(meeting.dateTime, timezone, locale)}</span>
            <FactDot />
            <span>{t('speakerCount', { count: stats.speakerCount })}</span>
        </span>
    );
}

/**
 * One subject below the leader.
 *
 * The scale its bar is drawn against is the list maximum rather than the
 * leader's own time, because the ranking is a blend — recency and which body
 * took the subject up both count — so the top entry is not always the longest
 * debate. Measuring against the leader would push those bars past full width
 * and quietly clamp them.
 *
 * No avatars here — they would put a handful of full person records per row into
 * the payload for a list that is read as a ranking, not as a set of profiles.
 */
export function HotTopicRow({ card, rank, maxSeconds, timezone, locale, onOpen }: HotTopicRowProps) {
    const t = useTranslations('cityOverview');
    const { subject, stats } = card;
    const topic = topicStyle(subject.topic?.colorHex);
    const width = hotTopicBarWidth(stats.speakingSeconds, maxSeconds);

    return (
        <button
            type="button"
            onClick={onOpen}
            className="relative flex w-full items-center gap-3 overflow-hidden border-t border-border px-4 py-3 text-left transition-colors hover:bg-muted/30"
        >
            <HotTopicBar width={width} background={topic.background} />
            <HotTopicRank rank={rank} className="relative z-10" />
            <TopicIcon
                color={subject.topic?.colorHex}
                icon={subject.topic?.icon}
                size="sm"
                className="relative z-10"
            />
            <span className="relative z-10 min-w-0 flex-1">
                <span className="line-clamp-2 text-[15px] leading-snug sm:block sm:truncate">
                    {localizeText(subject.name, locale)}
                </span>
                <HotTopicFacts card={card} timezone={timezone} locale={locale} size="sm" />
            </span>
            <span className="relative z-10 hidden shrink-0 text-sm font-bold tabular-nums sm:block">
                {t('discussionMinutes', { minutes: stats.minutes })}
            </span>
        </button>
    );
}
