import { ChevronRight, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { CouncilMeetingWithAdminBodyAndSubjects } from '@/lib/db/meetings';
import { getLocalizedName } from '@/lib/formatters/name';
import { formatDateStamp, formatDateTime } from '@/lib/formatters/time';
import { AdminBodyLabel } from './AdminBodyLabel';

interface CityMeetingsModuleProps {
    /** The soonest scheduled meeting, if the council has published one. */
    next: CouncilMeetingWithAdminBodyAndSubjects | null;
    /** The most recent meeting already held. */
    latest: CouncilMeetingWithAdminBodyAndSubjects | null;
    cityId: string;
    timezone: string;
    locale: string;
}

/**
 * The two meetings an administrative user opens this page for: the one coming
 * up and the one that just happened.
 *
 * The next-meeting row is absent rather than empty when nothing is scheduled —
 * most councils publish the record after the fact, so for many cities it will
 * never appear, and a permanent "no upcoming meeting" placeholder would be dead
 * weight at the top of the page.
 */
export function CityMeetingsModule({ next, latest, cityId, timezone, locale }: CityMeetingsModuleProps) {
    const t = useTranslations('cityOverview');
    const tMeeting = useTranslations('CouncilMeeting');

    if (!next && !latest) return null;

    return (
        <div className="overflow-hidden rounded-2xl border border-foreground/60 bg-card">
            {next && (
                <Link
                    href={`/${cityId}/${next.id}`}
                    className="flex items-start gap-3 border-b border-[hsl(var(--orange))]/25 bg-[hsl(var(--orange))]/[0.07] px-4 py-3 hover:no-underline"
                >
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--orange))]" aria-hidden />
                    <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-extrabold uppercase tracking-[0.16em] text-[hsl(var(--orange))]">
                            {t('nextMeeting')}
                        </span>
                        <span className="mt-1 block text-base leading-tight">
                            {getLocalizedName(next, locale)}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                            {formatDateTime(next.dateTime, timezone, 'medium', locale)}
                        </span>
                        <AdminBodyLabel body={next.administrativeBody} locale={locale} className="mt-1" />
                    </span>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
            )}

            {latest && (
                <>
                    <div className="border-b border-border bg-muted/40 px-4 py-2.5">
                        <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                            {t('latestMeeting')}
                        </span>
                    </div>
                    <div className="p-4">
                        <div className="flex items-start gap-4">
                            <DateStamp date={latest.dateTime} timezone={timezone} locale={locale} />
                            <div className="min-w-0">
                                <h3 className="text-lg leading-snug">{getLocalizedName(latest, locale)}</h3>
                                <AdminBodyLabel body={latest.administrativeBody} locale={locale} className="mt-1.5" />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {formatDateTime(latest.dateTime, timezone, 'medium', locale)}
                                    {' · '}
                                    {tMeeting('subjectsCount', { count: latest.subjects.length })}
                                </p>
                            </div>
                        </div>
                        <Link
                            href={`/${cityId}/${latest.id}`}
                            className="mt-4 flex h-10 items-center justify-center gap-2 rounded-lg bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90 hover:no-underline"
                        >
                            <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
                            {tMeeting('watchMeeting')}
                        </Link>
                    </div>
                </>
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
