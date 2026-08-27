"use client";
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { CouncilMeetingWithSubjectPreview } from '@/lib/db/meetings';
import { getLocalizedName } from '@/lib/formatters/name';
import { formatDateStamp, formatDateTime } from '@/lib/formatters/time';
import { cn } from '@/lib/utils';
import { AdminBodyLabel } from './AdminBodyLabel';

type Meeting = CouncilMeetingWithSubjectPreview;

/** The soonest scheduled meeting and the most recent one held, for one scope. */
export interface MeetingBookends {
    next: Meeting | null;
    latest: Meeting | null;
}

interface CityMeetingsModuleProps {
    /** Every administrative body. */
    all: MeetingBookends;
    /** The council alone — what most readers mean by "the council met". */
    council: MeetingBookends;
    cityId: string;
    timezone: string;
    locale: string;
}

/**
 * The two meetings a reader opens this page for: the one coming up and the one
 * that just happened.
 *
 * A busy municipality's committees and κοινότητες meet far more often than its
 * council, so the most recent meeting is usually a committee's — accurate, and
 * usually not what someone asking "what did the council do" wants. The scope
 * switch answers both without a page load; it is hidden when the two scopes
 * resolve to the same meetings, where it would be a control that does nothing.
 *
 * The next-meeting row is absent rather than empty when nothing is scheduled:
 * most councils publish the record after the fact, so for many cities it would
 * be a permanent placeholder.
 */
export function CityMeetingsModule({ all, council, cityId, timezone, locale }: CityMeetingsModuleProps) {
    const t = useTranslations('cityOverview');
    const tMeeting = useTranslations('CouncilMeeting');
    const [councilOnly, setCouncilOnly] = useState(false);

    const scoped = councilOnly ? council : all;
    const differs = all.next?.id !== council.next?.id || all.latest?.id !== council.latest?.id;

    if (!all.next && !all.latest) return null;

    return (
        <div className="overflow-hidden rounded-2xl border border-foreground/60 bg-card">
            {scoped.next && (
                <Link
                    href={`/${cityId}/${scoped.next.id}`}
                    className="flex items-start gap-3 border-b border-[hsl(var(--orange))]/25 bg-[hsl(var(--orange))]/[0.07] px-4 py-3 hover:no-underline"
                >
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--orange))]" aria-hidden />
                    <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-extrabold uppercase tracking-[0.16em] text-[hsl(var(--orange))]">
                            {t('nextMeeting')}
                        </span>
                        <span className="mt-1 block text-base leading-tight">
                            {getLocalizedName(scoped.next, locale)}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                            {formatDateTime(scoped.next.dateTime, timezone, 'medium', locale)}
                        </span>
                        <AdminBodyLabel body={scoped.next.administrativeBody} locale={locale} className="mt-1" />
                    </span>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[hsl(var(--orange))]" aria-hidden />
                </Link>
            )}

            <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                    {t('latestMeeting')}
                </span>
                {differs && (
                    <span className="flex shrink-0 items-center rounded-full bg-background p-0.5 text-[10px] font-semibold">
                        {[
                            { on: true, label: t('scopeCouncil') },
                            { on: false, label: t('scopeAll') },
                        ].map(option => (
                            <button
                                key={option.label}
                                type="button"
                                onClick={() => setCouncilOnly(option.on)}
                                aria-pressed={councilOnly === option.on}
                                className={cn(
                                    'rounded-full px-2 py-0.5 transition-colors',
                                    councilOnly === option.on
                                        ? 'bg-foreground text-background'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </span>
                )}
            </div>

            {scoped.latest ? (
                // The row is the link, the way the next-meeting row above already
                // is. A filled button under it repeated the same target and cost
                // 56px of a phone screen that the tabs needed more.
                <Link
                    href={`/${cityId}/${scoped.latest.id}`}
                    className="group/latest flex items-start gap-4 p-4 transition-colors hover:bg-foreground/[0.02] hover:no-underline"
                    aria-label={t('viewMeeting')}
                >
                    <DateStamp date={scoped.latest.dateTime} timezone={timezone} locale={locale} />
                    <span className="min-w-0 flex-1">
                        <span className="block text-lg leading-snug transition-colors group-hover/latest:text-[hsl(var(--orange))]">
                            {getLocalizedName(scoped.latest, locale)}
                        </span>
                        <AdminBodyLabel body={scoped.latest.administrativeBody} locale={locale} className="mt-1.5" />
                        <span className="mt-1 block text-xs text-muted-foreground">
                            {formatDateTime(scoped.latest.dateTime, timezone, 'medium', locale)}
                            {' · '}
                            {tMeeting('subjectsCount', { count: scoped.latest.subjects.length })}
                        </span>
                    </span>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
            ) : (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">{t('noMeetingsForScope')}</p>
            )}
        </div>
    );
}

function DateStamp({ date, timezone, locale }: { date: Date | string; timezone: string; locale: string }) {
    const { day, monthYear } = formatDateStamp(date, timezone, locale);
    return (
        <div className="shrink-0 border-r border-border pr-4 text-center tabular-nums">
            <div className="text-3xl leading-none tracking-tight">{day}</div>
            <div className="mt-1.5 text-[10px] font-extrabold tracking-[0.14em] text-muted-foreground">{monthYear}</div>
        </div>
    );
}
