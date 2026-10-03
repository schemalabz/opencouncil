'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Eyebrow } from '@/components/signup/SignupChrome';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { formatDistance } from '@/lib/formatters/distance';
import { getLocalizedName } from '@/lib/formatters/name';
import { formatDate, formatDayMonth } from '@/lib/formatters/time';
import { cn } from '@/lib/utils';
import type { NearbyState } from './useNearbySubjects';

/**
 * What the council discussed recently near the reader's latest place: the
 * moment the step pays off. The rows are text, not links: leaving the page
 * here would drop the reader's answers.
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

    return (
        <section aria-label={t('nearby.eyebrow')} className={cn(surfaceCardClass, 'overflow-hidden', className)}>
            <div className="px-3.5 pb-2 pt-3">
                <Eyebrow>{t('nearby.eyebrow')}</Eyebrow>
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
                            <li key={subject.id} className="flex gap-3 border-t border-border px-3.5 py-2.5">
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm leading-snug">{subject.name}</span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                        {[
                                            subject.topic ? getLocalizedName(subject.topic, locale) : null,
                                            formatDayMonth(new Date(subject.meetingDate), timezone, locale),
                                        ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </span>
                                </span>
                                <span className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-muted-foreground">
                                    {formatDistance(subject.distanceMeters, locale)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}
