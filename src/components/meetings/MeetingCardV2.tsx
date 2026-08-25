import { ChevronRight } from 'lucide-react';
import { isFuture } from 'date-fns';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { AdminBodyLabel } from '@/components/cities/overview/AdminBodyLabel';
import type { CouncilMeetingWithSubjectPreview } from '@/lib/db/meetings';
import { SUBJECT_PREVIEW_COUNT } from '@/lib/utils/subjects';
import { getLocalizedName } from '@/lib/formatters/name';
import { formatDateStamp, formatDateTime, sameCalendarDay } from '@/lib/formatters/time';
import { TopicIcon } from '@/components/TopicIcon';
import { localizeText } from '@/lib/serbian';
import { sortSubjectsByImportance } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface MeetingCardV2Props {
    /**
     * The preview projection, not the full meeting: the card draws three titles
     * and a count, and the full one carries every subject's prose to do it.
     */
    item: CouncilMeetingWithSubjectPreview;
    editable: boolean;
    cityTimezone: string;
}

/**
 * A meeting in a list.
 *
 * Anchored on a date stamp rather than on its title, because a council's meeting
 * names are near-identical ("Δημοτικό Συμβούλιο 11/02/26") and the date is what
 * distinguishes one card from the next. The administrative body sits beside it,
 * since council and committee decide different things.
 *
 * Below, the three most-discussed items — what the meeting was actually about,
 * which the title never says.
 *
 * Deliberately hook-light so it renders in both a Server Component (the city
 * overview) and inside List, which is a client component.
 */
export default function MeetingCardV2({ item: meeting, cityTimezone }: MeetingCardV2Props) {
    const t = useTranslations('MeetingCard');
    const tMeeting = useTranslations('CouncilMeeting');
    const locale = useLocale();

    const date = meeting.dateTime instanceof Date ? meeting.dateTime : new Date(meeting.dateTime);
    const { day, monthYear } = formatDateStamp(date, cityTimezone, locale);
    const upcoming = isFuture(date);
    // "Today" has to mean today in the council's timezone, not the reader's or
    // the server's: comparing calendar days in the runtime zone made a UTC server
    // and an Athens browser disagree for the first hours of every local day, so
    // the badge contradicted the date stamp beside it and vanished on hydration.
    const today = !upcoming && sameCalendarDay(date, new Date(), cityTimezone);
    const subjects = sortSubjectsByImportance(meeting.subjects, 'importance');
    const subjectCount = meeting.subjects.length;
    const remaining = subjectCount - SUBJECT_PREVIEW_COUNT;

    return (
        <Link
            href={`/${meeting.cityId}/${meeting.id}`}
            className={cn(
                'group flex h-full flex-col overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md hover:no-underline',
                upcoming ? 'border-[hsl(var(--orange))]/50' : 'border-foreground/60',
                !meeting.released && 'border-dashed',
            )}
        >
            <div
                className={cn(
                    'flex items-center justify-between gap-2 border-b px-4 py-3',
                    upcoming ? 'border-[hsl(var(--orange))]/25 bg-[hsl(var(--orange))]/[0.07]' : 'border-border bg-muted/40',
                )}
            >
                <span className="flex items-baseline gap-2 tabular-nums">
                    <span className={cn('text-2xl leading-none tracking-tight', upcoming && 'text-[hsl(var(--orange))]')}>
                        {day}
                    </span>
                    <span className="text-[10px] font-extrabold tracking-[0.14em] text-muted-foreground">{monthYear}</span>
                </span>

                <span className="flex min-w-0 items-center gap-2">
                    {(upcoming || today) && (
                        <span className="shrink-0 rounded-full bg-[hsl(var(--orange))] px-2 py-0.5 text-[11px] font-semibold text-white">
                            {upcoming ? t('upcoming') : t('today')}
                        </span>
                    )}
                    {!meeting.released && (
                        <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                            {t('notPublic')}
                        </span>
                    )}
                    <AdminBodyLabel
                        body={meeting.administrativeBody}
                        locale={locale}
                        className="min-w-0 shrink text-[11px]"
                    />
                </span>
            </div>

            <div className="flex flex-1 flex-col p-4">
                <h3 className="!text-left text-lg leading-snug transition-colors group-hover:text-[hsl(var(--orange))]">
                    {getLocalizedName(meeting, locale)}
                </h3>
                <p className="mt-1.5 text-xs text-muted-foreground">
                    {formatDateTime(date, cityTimezone, 'medium', locale)}
                    {subjectCount > 0 && (
                        <> · {tMeeting('subjectsCount', { count: subjectCount })}</>
                    )}
                </p>

                {subjects.length > 0 ? (
                    <>
                        <ul className="mt-3 flex flex-col gap-1.5 border-t border-border py-3">
                            {subjects.slice(0, SUBJECT_PREVIEW_COUNT).map(subject => (
                                <li key={subject.id} className="flex items-center gap-2.5 text-[13px] leading-snug">
                                    <TopicIcon
                                        color={subject.topic?.colorHex}
                                        icon={subject.topic?.icon}
                                        size="sm"
                                    />
                                    <span className="min-w-0 truncate text-foreground/85">
                                        {localizeText(subject.name, locale)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        {remaining > 0 && (
                            <span className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                                {t('moreSubjects', { count: remaining })}
                                <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            </span>
                        )}
                    </>
                ) : (
                    <span className="mt-3 flex items-center gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
                        <span className="h-px flex-1 bg-border" aria-hidden />
                        {t('noSubjects')}
                        <span className="h-px flex-1 bg-border" aria-hidden />
                    </span>
                )}
            </div>
        </Link>
    );
}
