import { useTranslations } from 'next-intl';
import type { HotSubjectCard } from '@/lib/hotSubjectCards';
import { formatDate } from '@/lib/formatters/time';
import { localizeText } from '@/lib/serbian';
import { TopicIcon } from '@/components/TopicIcon';
import { SubjectImage } from '@/components/subject/SubjectImage';
import { AdminBodyLabel } from './AdminBodyLabel';

interface HotTopicRowProps {
    card: HotSubjectCard;
    /** Position in the ranking, 1-based. */
    rank: number;
    timezone: string;
    locale: string;
    /** Opens this row in place. */
    onOpen: () => void;
}

/**
 * One subject below the leader.
 *
 * The subject's illustration fills the row, faded almost out by a scrim in the
 * card's own colour: the row keeps its dark text on a light surface, and the
 * picture reads as a tint behind it. The row used to draw a tinted band as wide
 * a fraction of itself as the subject's debate time was of the longest in the
 * list; the illustration now occupies that same strip, and two washes behind
 * one line of text read as noise. The debate time is the figure at the row's
 * end.
 *
 * No avatars here — they would put a handful of full person records per row into
 * the payload for a list that is read as a ranking, not as a set of profiles.
 */
export function HotTopicRow({ card, rank, timezone, locale, onOpen }: HotTopicRowProps) {
    const t = useTranslations('cityOverview');
    const { subject, meeting, stats } = card;

    return (
        <button
            type="button"
            onClick={onOpen}
            aria-expanded={false}
            className="group relative flex w-full items-center gap-3 overflow-hidden border-t border-border px-4 py-3 text-left"
        >
            <span className="absolute inset-0 z-0" aria-hidden>
                <SubjectImage subjectId={subject.id} alt="" />
            </span>
            {/* The scrim is what keeps the text legible against every image the model
                draws, bright or dark: one wash in the card's own colour, rather than
                an opacity on the image, which would wash the light images out and
                leave the dark ones opaque. It thins on hover, which is the row's only
                affordance now that it carries no hover tint of its own. */}
            <span
                className="absolute inset-0 z-0 bg-card/80 transition-colors duration-200 group-hover:bg-card/70"
                aria-hidden
            />
            <span className="relative z-10 w-6 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">
                {String(rank).padStart(2, '0')}
            </span>
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
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    {/* The debate time keeps its own column where there is width for
                        one. On a phone that column took two thirds of the title, so
                        it joins the facts underneath instead — still the loudest of
                        them, since it is what the list is ranked on. */}
                    <span className="font-bold text-foreground sm:hidden">
                        {t('discussionMinutes', { minutes: stats.minutes })}
                    </span>
                    <span className="sm:hidden" aria-hidden>·</span>
                    <AdminBodyLabel body={meeting.administrativeBody} locale={locale} className="text-[11px]" />
                    <span aria-hidden>·</span>
                    <span>{formatDate(meeting.dateTime, timezone, locale)}</span>
                    <span aria-hidden>·</span>
                    <span>{t('speakerCount', { count: stats.speakerCount })}</span>
                </span>
            </span>
            <span className="relative z-10 hidden shrink-0 text-sm font-bold tabular-nums sm:block">
                {t('discussionMinutes', { minutes: stats.minutes })}
            </span>
        </button>
    );
}
