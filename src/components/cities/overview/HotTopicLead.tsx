import { ArrowRight } from 'lucide-react';
import { captureEvent } from '@/lib/analytics/capture';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { HotSubjectCard } from '@/lib/hotSubjectCards';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { localizeText } from '@/lib/serbian';
import { TopicPill } from '@/components/TopicPill';
import { SubjectImage } from '@/components/subject/SubjectImage';
import { HotTopicFacts, HotTopicRank } from './HotTopicRow';

interface HotTopicLeadProps {
    card: HotSubjectCard;
    /** Position in the ranking, 1-based. */
    rank: number;
    cityId: string;
    timezone: string;
    locale: string;
}

/**
 * The most-discussed subject, opened out.
 *
 * It sits inside the same list as the rows below rather than in a card of its
 * own: the ranking is one sequence, and lifting the leader into a separate
 * container would read as two lists that happen to be adjacent. It carries its
 * illustration the same way they do, filling the entry. Its scrim is dark where
 * theirs are light: the entry the page is claiming matters reads as the primary
 * block of the list, and inverting it is what says "this one is open".
 */
export function HotTopicLead({ card, rank, cityId, timezone, locale }: HotTopicLeadProps) {
    const t = useTranslations('cityOverview');
    const { subject, meeting, stats } = card;
    const captureOpen = () =>
        captureEvent('subject_opened', { surface: 'hot_topics', subject_id: subject.id, city_id: cityId, rank });
    const href = `/${cityId}/${meeting.id}/subjects/${subject.id}`;
    const description = subject.description ? localizeText(stripMarkdown(subject.description), locale) : null;

    return (
        <div>
            <article className="relative overflow-hidden px-4 py-4">
                <span className="absolute inset-0 z-0" aria-hidden>
                    <SubjectImage subjectId={subject.id} alt="" topic={subject.topic} />
                </span>
                {/* The open entry inverts: a dark scrim where the rows carry a light one,
                    so the entry the page is claiming matters reads as the primary block
                    of the list and its picture comes through at full strength. */}
                <span className="absolute inset-0 z-0 bg-black/65" aria-hidden />
                <div className="relative z-10 flex items-start gap-3">
                    <HotTopicRank rank={rank} className="pt-1 text-white/60" />

                    <div className="min-w-0 flex-1">
                        {/* The topic names the leader only, so it sits inside the leader's own
                            column. As a band across the container top it read as a heading for
                            the whole ranking — seven subjects under one topic. */}
                        {subject.topic && (
                            <TopicPill
                                className="mb-2"
                                label={localizeText(subject.topic.name, locale)}
                                icon={subject.topic.icon}
                                colorHex={subject.topic.colorHex}
                            />
                        )}
                        <h3 className="!text-left text-lg leading-tight text-white sm:text-xl">
                            <Link href={href} prefetch={false} onClick={captureOpen} className="text-white hover:no-underline">
                                {localizeText(subject.name, locale)}
                            </Link>
                        </h3>

                        <HotTopicFacts card={card} timezone={timezone} locale={locale} size="md" inverted />

                        {description && (
                            <p className="mt-2.5 max-w-[68ch] text-sm leading-relaxed text-white/85 line-clamp-2">
                                {description}
                            </p>
                        )}

                        <div className="mt-3 flex items-center justify-between gap-3 sm:mt-2.5 sm:justify-start">
                            <Link
                                href={href}
                                prefetch={false}
                                onClick={captureOpen}
                                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold text-[hsl(var(--orange))]"
                            >
                                {t('viewSubject')}
                                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                            </Link>
                        </div>
                    </div>

                    {/* The debate time keeps its own column where there is width for one. */}
                    <div className="hidden shrink-0 pl-2 sm:block">
                        <span className="text-sm font-bold tabular-nums text-white">
                            {t('discussionMinutes', { minutes: stats.minutes })}
                        </span>
                    </div>
                </div>
            </article>
        </div>
    );
}
