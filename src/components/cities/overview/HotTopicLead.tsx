import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import Icon from '@/components/icon';
import { PersonAvatarList } from '@/components/persons/PersonAvatarList';
import type { HotSubjectCard } from '@/lib/hotSubjectCards';
import { formatDate } from '@/lib/formatters/time';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { localizeText } from '@/lib/serbian';
import { topicStyle } from '@/lib/topicStyle';
import { hotTopicBarWidth } from '@/lib/utils/subjects';
import { AdminBodyLabel } from './AdminBodyLabel';

/** Where the metrics column starts, as a percentage of the row. */
const METRICS_COLUMN_EDGE_PCT = 88;

interface HotTopicLeadProps {
    card: HotSubjectCard;
    /** Position in the ranking, 1-based. */
    rank: number;
    /** Longest debate in the list — the scale every bar is drawn against. */
    maxSeconds: number;
    cityId: string;
    timezone: string;
    locale: string;
}

/**
 * The most-discussed subject, opened out.
 *
 * It sits inside the same list as the rows below rather than in a card of its
 * own: the ranking is one sequence, and lifting the leader into a separate
 * container would read as two lists that happen to be adjacent. Its bar is drawn
 * on the same scale as theirs, so being top of the ranking does not imply the
 * longest debate — the blend also weighs recency and which body took it up.
 */
export function HotTopicLead({ card, rank, maxSeconds, cityId, timezone, locale }: HotTopicLeadProps) {
    const t = useTranslations('cityOverview');
    const { subject, meeting, stats, speakers } = card;
    const topic = topicStyle(subject.topic?.colorHex);
    const href = `/${cityId}/${meeting.id}/subjects/${subject.id}`;
    const width = hotTopicBarWidth(stats.speakingSeconds, maxSeconds);
    const description = subject.description ? localizeText(stripMarkdown(subject.description), locale) : null;

    return (
        <div>
            {/* The stacked avatars ring themselves against whatever they sit on, or the
                ring turns into a halo around every circle. They sit in the metrics column,
                which is roughly the last eighth of the row, so the bar covers them only
                once it is nearly full width — and there the surface is the topic wash at
                half strength over the card, which is the mix below. */}
            <article
                className="relative overflow-hidden px-4 py-4"
                style={width >= METRICS_COLUMN_EDGE_PCT
                    ? { ['--avatar-ring' as string]: `color-mix(in srgb, ${topic.background} 50%, white)` }
                    : undefined}
            >
                <span
                    className="absolute inset-y-0 left-0 z-0"
                    style={{ width: `${width}%`, backgroundColor: topic.background, opacity: 0.5 }}
                    aria-hidden
                />
                <div className="relative z-10 flex items-start gap-3">
                    <span className="w-6 shrink-0 pt-1 text-xs font-bold tabular-nums text-muted-foreground">
                        {String(rank).padStart(2, '0')}
                    </span>

                    <div className="min-w-0 flex-1">
                        {/* The topic names the leader only, so it sits inside the leader's own
                            column. As a band across the container top it read as a heading for
                            the whole ranking — seven subjects under one topic. */}
                        {subject.topic && (
                            <span
                                className="mb-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none"
                                style={{ backgroundColor: topic.background, borderColor: topic.border, color: topic.icon }}
                            >
                                <Icon name={subject.topic.icon || 'hash'} color="currentColor" size={13} />
                                {localizeText(subject.topic.name, locale)}
                            </span>
                        )}
                        <h3 className="!text-left text-lg leading-tight sm:text-xl">
                            <Link href={href} prefetch={false} className="hover:no-underline">
                                {localizeText(subject.name, locale)}
                            </Link>
                        </h3>

                        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                            {/* The debate time keeps its own column where there is
                                width for one; on a phone it joins the facts here,
                                still the loudest of them. */}
                            <span className="font-bold text-foreground sm:hidden">
                                {t('discussionMinutes', { minutes: stats.minutes })}
                            </span>
                            <span className="sm:hidden" aria-hidden>·</span>
                            <AdminBodyLabel body={meeting.administrativeBody} locale={locale} />
                            <span aria-hidden>·</span>
                            <span>{formatDate(meeting.dateTime, timezone, locale)}</span>
                            <span aria-hidden>·</span>
                            <span>{t('speakerCount', { count: stats.speakerCount })}</span>
                        </div>

                        {description && (
                            <p className="mt-2.5 max-w-[68ch] text-sm leading-relaxed text-foreground/80 line-clamp-2">
                                {description}
                            </p>
                        )}

                        {/* The faces come down here on a phone, where the metrics
                            column would leave the title a third of the row. */}
                        <div className="mt-3 flex items-center justify-between gap-3 sm:mt-2.5 sm:justify-start">
                            <Link
                                href={href}
                                prefetch={false}
                                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold text-[hsl(var(--orange))]"
                            >
                                {t('viewSubject')}
                                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                            </Link>
                            {speakers.length > 0 && (
                                <span className="sm:hidden">
                                    <PersonAvatarList users={speakers} size="sm" maxDisplayed={4} stacked />
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Minutes and faces share the column the description leaves empty,
                        which is what made this entry twice as tall as it needed to be. */}
                    <div className="hidden shrink-0 flex-col items-end gap-3 pl-2 sm:flex">
                        <span className="text-sm font-bold tabular-nums">
                            {t('discussionMinutes', { minutes: stats.minutes })}
                        </span>
                        {speakers.length > 0 && (
                            <PersonAvatarList users={speakers} size="sm" maxDisplayed={4} stacked />
                        )}
                    </div>
                </div>
            </article>
        </div>
    );
}
