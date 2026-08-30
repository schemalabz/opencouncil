import { ChevronRight } from 'lucide-react';
import { isFuture } from 'date-fns';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { AdminBodyLabel } from '@/components/cities/overview/AdminBodyLabel';
import { TopicIcon } from '@/components/TopicIcon';
import type { CouncilMeetingWithSubjectPreview } from '@/lib/db/meetings';
import { getLocalizedName } from '@/lib/formatters/name';
import { formatDayMonthStamp, formatRelativeTime } from '@/lib/formatters/time';
import { localizeText } from '@/lib/serbian';
import { cn, sortSubjectsByImportance } from '@/lib/utils';
import { getAgendaFullLabel, getWithdrawnLabel } from '@/lib/utils/subjects';
import { surfaceCardClass } from '@/components/ui/surface-card';
import {
    packTimeline,
    timelineCardHeight,
    timelineSide,
    TL,
    type TimelineSide,
} from '@/lib/utils/meetingsTimeline';

interface MeetingsTimelineProps {
    /** The next scheduled meetings, soonest first — as the upcoming query returns them. */
    upcoming: CouncilMeetingWithSubjectPreview[];
    /** The latest held meetings, newest first. */
    recent: CouncilMeetingWithSubjectPreview[];
    timezone: string;
    locale: string;
}

interface Entry {
    meeting: CouncilMeetingWithSubjectPreview;
    side: TimelineSide;
    upcoming: boolean;
    height: number;
}

/**
 * The recent meetings as one chronology: committees left, the council right, a
 * date spine down the middle — the alternating rhythm of a Greek δήμος, which a
 * grid of cards cannot show. Scheduled meetings ride the top of the spine in a
 * dashed treatment; their agendas are published before they happen, so the
 * module ends (upward) with what a reader can still attend.
 *
 * Greek-realm cities only — the two-sided split is the ΔΕ/ΔΣ shape of Greek
 * local government. Other realms keep the card grid.
 *
 * Everything in a card has a fixed height (one-line titles, fixed chip rows) so
 * the packing in lib/utils/meetingsTimeline stays exact; if a card gains a
 * variable-height element, the desktop layout's positions go wrong with it.
 */
export function MeetingsTimeline({ upcoming, recent, timezone, locale }: MeetingsTimelineProps) {
    // One strictly-descending chronology: the furthest-out meeting first, down
    // through the nearest, then the past. The spine reads top-to-bottom as
    // future-to-past, so "now" is where the dashes end. Meetings the timeline
    // excludes — the κοινότητες, see timelineSide — drop out here.
    const entries: Entry[] = [...upcoming].reverse().concat(recent).flatMap(meeting => {
        const side = timelineSide(meeting.administrativeBody?.type);
        if (side === null) return [];
        return [{
            meeting,
            side,
            upcoming: isFuture(new Date(meeting.dateTime)),
            height: timelineCardHeight(meeting.subjects.length),
        }];
    });
    if (entries.length === 0) return null;

    // The split earns its keep only when both sides have meetings — a δήμος with
    // no committees (or one whose committees have not met) gets the plain rail.
    const twoSided = entries.some(e => e.side === 'left') && entries.some(e => e.side === 'right');

    return (
        <div>
            {twoSided && (
                <>
                    <TwoSided entries={entries} timezone={timezone} locale={locale} />
                    <div className="xl:hidden">
                        <Rail entries={entries} timezone={timezone} locale={locale} />
                    </div>
                </>
            )}
            {!twoSided && (
                <div className="max-w-2xl">
                    <Rail entries={entries} timezone={timezone} locale={locale} />
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Desktop: the two-sided spine                                        */
/* ------------------------------------------------------------------ */

function TwoSided({ entries, timezone, locale }: { entries: Entry[]; timezone: string; locale: string }) {
    const t = useTranslations('cityOverview');
    const { placements, height } = packTimeline(entries);

    // The dashes are the future: they run down to the first held meeting's tick
    // and the solid line takes over — "now" is legible without a label for it.
    const firstPastIndex = entries.findIndex(e => !e.upcoming);
    const dashEnd =
        firstPastIndex === -1 ? height : firstPastIndex === 0 ? 0 : placements[firstPastIndex].top + TL.TICK_Y;

    return (
        <div className="hidden xl:block">
            <div className="mb-4 flex items-baseline">
                <div className="w-[calc(50%-3.25rem)] pr-1 text-right">
                    <ColumnLabel entries={entries} side="left" fallback={t('scopeCommitteeFull')} locale={locale} />
                </div>
                <div className="w-[6.5rem]" />
                <div className="flex-1 pl-1">
                    <ColumnLabel entries={entries} side="right" fallback={t('scopeCouncilFull')} locale={locale} />
                </div>
            </div>

            <div className="relative" style={{ height: height + 4 }}>
                {dashEnd > 0 && (
                    <span
                        aria-hidden
                        className="absolute left-1/2 w-0 -translate-x-1/2 border-l border-dashed border-border"
                        style={{ top: 0, height: dashEnd }}
                    />
                )}
                {dashEnd < height - 36 && (
                    <span
                        aria-hidden
                        className="absolute left-1/2 w-px -translate-x-1/2 bg-border"
                        style={{ top: dashEnd, height: height - 36 - dashEnd }}
                    />
                )}
                <span
                    aria-hidden
                    className="absolute left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-border to-transparent"
                    style={{ top: Math.max(dashEnd, height - 36), height: 36 }}
                />

                {entries.map((entry, i) => {
                    const { top, height: cardHeight } = placements[i];
                    const left = entry.side === 'left';
                    return (
                        <div key={entry.meeting.id}>
                            <span
                                aria-hidden
                                className={cn(
                                    'absolute h-px w-[3.25rem] bg-border',
                                    left ? 'left-[calc(50%-3.25rem)]' : 'left-1/2',
                                )}
                                style={{ top: top + TL.TICK_Y }}
                            />
                            <DatePill entry={entry} timezone={timezone} locale={locale} className="absolute left-1/2 -translate-x-1/2" style={{ top }} />
                            <div
                                className={cn(
                                    'absolute w-[calc(50%-3.25rem)]',
                                    left ? 'left-0' : 'left-[calc(50%+3.25rem)]',
                                )}
                                style={{ top, height: cardHeight }}
                            >
                                <MeetingBlock entry={entry} locale={locale} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * A column's heading: the body's own name when one body owns the side, the
 * generic label when several share it. Proper names stay in their own case —
 * nothing here is uppercased.
 */
function ColumnLabel({
    entries,
    side,
    fallback,
    locale,
}: {
    entries: Entry[];
    side: TimelineSide;
    fallback: string;
    locale: string;
}) {
    const names = new Set(
        entries
            .filter(e => e.side === side && e.meeting.administrativeBody)
            .map(e => getLocalizedName(e.meeting.administrativeBody!, locale)),
    );
    const label = names.size === 1 ? [...names][0] : fallback;
    return <span className="text-[11px] font-bold tracking-wide text-muted-foreground">{label}</span>;
}

/* ------------------------------------------------------------------ */
/* Compact: one rail — phones, and any δήμος with a single body        */
/* ------------------------------------------------------------------ */

function Rail({ entries, timezone, locale }: { entries: Entry[]; timezone: string; locale: string }) {
    return (
        <ol className="m-0 list-none p-0">
            {entries.map((entry, i) => (
                <li key={entry.meeting.id} className="flex gap-3">
                    <div className="flex w-[4.75rem] shrink-0 flex-col items-center">
                        <DatePill entry={entry} timezone={timezone} locale={locale} />
                        {i < entries.length - 1 && (
                            <span
                                aria-hidden
                                className={cn(
                                    'min-h-[1rem] w-0 flex-1 border-l',
                                    entry.upcoming ? 'border-dashed border-border' : 'border-solid border-border',
                                )}
                            />
                        )}
                    </div>
                    <div className={cn('min-w-0 flex-1', i < entries.length - 1 && 'pb-4')}>
                        <MeetingBlock entry={entry} locale={locale} />
                    </div>
                </li>
            ))}
        </ol>
    );
}

/* ------------------------------------------------------------------ */
/* The shared pieces                                                   */
/* ------------------------------------------------------------------ */

function DatePill({
    entry,
    timezone,
    locale,
    className,
    style,
}: {
    entry: Entry;
    timezone: string;
    locale: string;
    className?: string;
    style?: React.CSSProperties;
}) {
    const { day, month } = formatDayMonthStamp(entry.meeting.dateTime, timezone, locale);
    return (
        <span
            className={cn(
                'inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-full border bg-card px-2.5 shadow-sm',
                entry.upcoming ? 'border-dashed border-[hsl(var(--orange))]/60' : 'border-border',
                className,
            )}
            style={style}
        >
            <span
                aria-hidden
                className={cn(
                    'h-[7px] w-[7px] shrink-0 rounded-full',
                    entry.upcoming ? 'border-[1.5px] border-[hsl(var(--orange))] bg-card' : 'bg-[hsl(var(--orange))]',
                )}
            />
            <span className="whitespace-nowrap text-[11px] font-bold tabular-nums tracking-tight">
                {day} {month}
            </span>
        </span>
    );
}

/**
 * One meeting's card. Every piece has a fixed height — see the module comment;
 * timelineCardHeight() must agree with what renders here.
 */
function MeetingBlock({ entry, locale }: { entry: Entry; locale: string }) {
    const t = useTranslations('cityOverview');
    const tCard = useTranslations('MeetingCard');
    const tMeeting = useTranslations('CouncilMeeting');
    const { meeting } = entry;
    const subjects = sortSubjectsByImportance(meeting.subjects, 'importance');
    const shown = subjects.slice(0, TL.PREVIEW_ROWS);
    const remaining = meeting.subjects.length - shown.length;

    return (
        <Link
            href={`/${meeting.cityId}/${meeting.id}`}
            className={cn(
                surfaceCardClass,
                'block h-full px-4 pb-2.5 pt-3 text-foreground transition-shadow hover:shadow-md hover:no-underline',
                entry.upcoming ? 'border-dashed border-[hsl(var(--orange))]/50' : 'shadow-sm',
            )}
        >
            <div className="mb-1.5 flex h-6 items-center justify-between gap-2">
                <AdminBodyLabel body={meeting.administrativeBody} locale={locale} className="min-w-0 text-xs" />
                {entry.upcoming ? (
                    <span className="shrink-0 text-[11px] font-semibold text-[hsl(var(--orange-deep))]">
                        {formatRelativeTime(new Date(meeting.dateTime), locale)}
                    </span>
                ) : (
                    meeting.subjects.length > 0 && (
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                            {tMeeting('subjectsCount', { count: meeting.subjects.length })}
                        </span>
                    )
                )}
            </div>

            {shown.length > 0 ? (
                <ul className="m-0 list-none p-0">
                    {shown.map(subject => (
                        <SubjectRow key={subject.id} subject={subject} locale={locale} />
                    ))}
                </ul>
            ) : (
                <div className="flex h-[38px] items-center border-t border-border text-xs italic text-muted-foreground">
                    {entry.upcoming ? t('timelineNoAgendaYet') : tCard('noSubjects')}
                </div>
            )}

            {remaining > 0 && (
                <span className="flex h-[30px] items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
                    {tCard('moreSubjects', { count: remaining })}
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                </span>
            )}
        </Link>
    );
}

type PreviewSubject = CouncilMeetingWithSubjectPreview['subjects'][number];

function SubjectRow({ subject, locale }: { subject: PreviewSubject; locale: string }) {
    const tSubject = useTranslations('Subject');
    return (
        <li className="flex h-[59px] items-start gap-2.5 overflow-hidden border-t border-border py-2">
            <TopicIcon color={subject.topic?.colorHex} icon={subject.topic?.icon} size="sm" />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] leading-[18px] text-foreground/85">
                    {localizeText(subject.name, locale)}
                </span>
                <span className="mt-1 flex h-5 items-center gap-1.5 overflow-hidden">
                    <AgendaChip subject={subject} t={tSubject} />
                </span>
            </span>
        </li>
    );
}

/**
 * The agenda-state chip: an item's place on the ημερήσια διάταξη, or the state
 * that kept it off it. Withdrawn wins — a pulled item's number no longer means
 * anything. Text stays in its written case; no uppercase transform touches it.
 */
function AgendaChip({ subject, t }: { subject: PreviewSubject; t: ReturnType<typeof useTranslations> }) {
    const base = 'inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-semibold leading-none';
    if (subject.withdrawn) {
        return <span className={cn(base, 'border border-border italic text-muted-foreground')}>{getWithdrawnLabel(t, subject)}</span>;
    }
    const label = getAgendaFullLabel(t, subject);
    if (label === null) return null;
    if (subject.agendaItemIndex) {
        return <span className={cn(base, 'bg-muted text-muted-foreground')}>{label}</span>;
    }
    return (
        <span
            className={cn(
                base,
                'border text-muted-foreground',
                subject.nonAgendaReason === 'beforeAgenda' ? 'border-dashed border-muted-foreground/40' : 'border-border',
            )}
        >
            {label}
        </span>
    );
}
