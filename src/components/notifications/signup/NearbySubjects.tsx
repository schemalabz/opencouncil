'use client';

import { ArrowUpRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Eyebrow } from '@/components/signup/SignupChrome';
import { Link } from '@/i18n/routing';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { formatDistance } from '@/lib/formatters/distance';
import { getLocalizedName } from '@/lib/formatters/name';
import { formatDate, formatDayMonth } from '@/lib/formatters/time';
import { cn } from '@/lib/utils';
import type { NearbyState } from './useNearbySubjects';

/**
 * What the council discussed recently near the reader's latest place: the
 * moment the step pays off. Each row opens its subject in a new tab, so the
 * signup and the reader's answers stay where they are.
 *
 * A failed request hides the card. It is a preview, and the step works
 * without it.
 */
export function NearbySubjects({
    state,
    timezone,
    className,
}: {
    state: NearbyState;
    timezone: string;
    className?: string;
}) {
    const t = useTranslations('notificationSignup');
    const locale = useLocale();

    if (state.status === 'failed') return null;

    // When the period held no meetings, the subjects are older: the heading
    // stops calling them recent and the dates carry their year.
    const older = state.status === 'ready' && state.beyondPeriod;
    const heading = older ? t('nearby.eyebrowOlder') : t('nearby.eyebrow');
    const meetingDate = (iso: string) =>
        older ? formatDate(new Date(iso), timezone, locale) : formatDayMonth(new Date(iso), timezone, locale);

    return (
        <section aria-label={heading} className={cn(surfaceCardClass, 'overflow-hidden', className)}>
            <div className="px-3.5 pb-2 pt-3">
                <Eyebrow>{heading}</Eyebrow>
            </div>
            <div aria-live="polite" aria-busy={state.status === 'loading'}>
                {state.status === 'loading' ? (
                    <ul aria-hidden>
                        {[0, 1, 2].map((row) => (
                            <li key={row} className="flex flex-col gap-1.5 border-t border-border px-3.5 py-3">
                                <span className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
                                <span className="h-3 w-2/5 animate-pulse rounded bg-muted" />
                            </li>
                        ))}
                    </ul>
                ) : state.subjects.length === 0 ? (
                    <p className="border-t border-border px-3.5 py-3 text-[13px] leading-[1.45] text-muted-foreground">
                        {state.since
                            ? t('nearby.emptySince', { date: formatDate(new Date(state.since), timezone, locale) })
                            : t('nearby.empty')}
                    </p>
                ) : (
                    <ul>
                        {state.subjects.map((subject) => (
                            <li key={subject.id} className="border-t border-border">
                                <Link
                                    href={subject.path}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group flex items-start gap-3 px-3.5 py-3 hover:no-underline focus-visible:bg-muted/60 focus-visible:outline-none"
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="line-clamp-2 text-sm leading-snug transition-colors group-hover:text-[hsl(var(--orange))]">
                                            {subject.name}
                                        </span>
                                        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                                            {subject.topic && (
                                                <span
                                                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                                                    style={{ backgroundColor: subject.topic.colorHex }}
                                                    aria-hidden
                                                />
                                            )}
                                            {/* The topic gives way on a narrow screen; the date, which may carry the year, never does. */}
                                            {subject.topic && (
                                                <>
                                                    <span className="min-w-0 truncate">{getLocalizedName(subject.topic, locale)}</span>
                                                    <span aria-hidden>·</span>
                                                </>
                                            )}
                                            <span className="shrink-0 whitespace-nowrap">{meetingDate(subject.meetingDate)}</span>
                                        </span>
                                    </span>
                                    <span className="flex shrink-0 items-center gap-1 pt-px text-xs tabular-nums text-muted-foreground">
                                        {formatDistance(subject.distanceMeters, locale)}
                                        <ArrowUpRight
                                            className="h-3.5 w-3.5 transition-colors group-hover:text-[hsl(var(--orange))]"
                                            aria-hidden
                                        />
                                    </span>
                                    <span className="sr-only">{t('nearby.newTab')}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}
