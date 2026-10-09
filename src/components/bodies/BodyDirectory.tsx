import type { AdministrativeBodyType } from '@prisma/client';
import { ArrowRight, CalendarDays, Flame, Landmark } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { CitySeal } from '@/components/signup/CityCard';
import { TopicPill } from '@/components/TopicPill';
import { RailCard } from '@/components/ui/rail-card';
import { surfaceCardClass } from '@/components/ui/surface-card';
import type { BodyDirectoryRow } from '@/lib/db/administrativeBodies';
import type { GeneralSubjectRow } from '@/lib/db/subject';
import { formatDate, formatWeekdayDateTime } from '@/lib/formatters/time';
import { getLocalizedMunicipalityName, getLocalizedName } from '@/lib/formatters/name';
import { subjectPath } from '@/lib/landing/landingData';
import { cn } from '@/lib/utils';

/** An upcoming meeting of the directory, as the page serializes it. */
export interface DirectoryUpcomingMeeting {
    id: string;
    cityId: string;
    cityName: string;
    name: string;
    /** ISO string: a cached row arrives as text. */
    dateTime: string;
    timezone: string;
}

export interface BodyDirectoryProps {
    type: AdministrativeBodyType;
    bodies: BodyDirectoryRow[];
    /** The most discussed subjects of the type across the realm. */
    hotSubjects: GeneralSubjectRow[];
    upcoming: DirectoryUpcomingMeeting[];
    locale: string;
}

const sectionTitleClass = '!m-0 !text-left text-lg';

/**
 * The directory of one body type across a realm (#829): every body of the
 * type that has released a meeting, the subjects they discussed most, and
 * the meetings coming up. youth.opencouncil.gr opens here; the page lives on
 * every realm at `bodyDirectoryPath(type)`.
 */
export async function BodyDirectory({ type, bodies, hotSubjects, upcoming, locale }: BodyDirectoryProps) {
    const t = await getTranslations({ locale, namespace: 'bodyDirectory' });
    const meetingsTotal = bodies.reduce((sum, body) => sum + body._count.meetings, 0);

    return (
        <div className="container mx-auto px-4 pb-20 pt-6 sm:pt-10">
            <header className="max-w-3xl">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">OpenCouncil</p>
                <h1 className="!mt-2 !text-left text-3xl font-bold tracking-tight sm:text-4xl">{t(`${type}.title`)}</h1>
                <p className="mt-3 text-base text-muted-foreground">{t(`${type}.lead`)}</p>
                <p className="mt-2 text-sm text-muted-foreground">{t('counts', { bodies: bodies.length, meetings: meetingsTotal })}</p>
            </header>

            <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0 space-y-10">
                    <section aria-labelledby="directory-bodies">
                        <h2 id="directory-bodies" className={sectionTitleClass}>{t('bodiesTitle')}</h2>
                        {bodies.length === 0 ? (
                            <p className="mt-3 text-sm text-muted-foreground">{t('noBodies')}</p>
                        ) : (
                            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                                {bodies.map(body => {
                                    const latest = body.meetings[0] ?? null;
                                    return (
                                        <li key={body.id}>
                                            <Link
                                                href={`/${body.city.id}/bodies/${body.id}`}
                                                prefetch={false}
                                                className={cn(surfaceCardClass, 'flex h-full items-start gap-3 p-4 transition-colors hover:bg-foreground/[0.02] hover:no-underline')}
                                            >
                                                <CitySeal name={body.city.name} logoImage={body.city.logoImage} size={40} />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-[15px] font-semibold leading-tight text-foreground">{getLocalizedName(body, locale)}</span>
                                                    <span className="mt-0.5 block text-sm text-muted-foreground">{getLocalizedMunicipalityName(body.city, locale)}</span>
                                                    <span className="mt-2 block text-xs text-muted-foreground">
                                                        {t('members', { count: body._count.roles })}
                                                        {' · '}
                                                        {t('meetings', { count: body._count.meetings })}
                                                        {latest && (
                                                            <>
                                                                {' · '}
                                                                {t('latestMeeting', { date: formatDate(new Date(latest.dateTime), body.city.timezone, locale) })}
                                                            </>
                                                        )}
                                                    </span>
                                                </span>
                                                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>

                    <section aria-labelledby="directory-hot">
                        <div className="flex items-center gap-2">
                            <Flame className="h-5 w-5 text-[hsl(var(--orange))]" aria-hidden />
                            <h2 id="directory-hot" className={sectionTitleClass}>{t('hotTitle')}</h2>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{t('hotLead')}</p>
                        {hotSubjects.length === 0 ? (
                            <p className="mt-3 text-sm text-muted-foreground">{t('noHot')}</p>
                        ) : (
                            <ol className={cn(surfaceCardClass, 'mt-4 divide-y divide-border overflow-hidden')}>
                                {hotSubjects.map(subject => (
                                    <li key={subject.id}>
                                        <Link
                                            href={subjectPath(subject.cityId, subject.councilMeetingId, subject.id)}
                                            prefetch={false}
                                            className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.02] hover:no-underline"
                                        >
                                            <CitySeal name={subject.cityName} logoImage={subject.logoImage} size={32} />
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[15px] font-medium leading-snug text-foreground">{subject.name}</span>
                                                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                                    <span>{subject.cityName}</span>
                                                    {subject.meetingDate && (
                                                        <span>{formatDate(new Date(subject.meetingDate), subject.cityTimezone, locale)}</span>
                                                    )}
                                                    {subject.discussionTimeSeconds ? (
                                                        <span>{t('discussionMinutes', { minutes: Math.max(1, Math.round(subject.discussionTimeSeconds / 60)) })}</span>
                                                    ) : null}
                                                    {subject.topicName && (
                                                        <TopicPill label={subject.topicName} icon={subject.topicIcon ?? null} colorHex={subject.topicColor} />
                                                    )}
                                                </span>
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </section>
                </div>

                <aside className="space-y-4">
                    <RailCard title={t('upcomingTitle')}>
                        {upcoming.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('noUpcoming')}</p>
                        ) : (
                            <ul className="divide-y divide-border">
                                {upcoming.map(meeting => (
                                    <li key={`${meeting.cityId}-${meeting.id}`}>
                                        <Link
                                            href={`/${meeting.cityId}/${meeting.id}`}
                                            prefetch={false}
                                            className="flex items-start gap-2.5 py-2.5 hover:no-underline"
                                        >
                                            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--orange))]" aria-hidden />
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-medium leading-snug text-foreground">{meeting.cityName}</span>
                                                <span className="block text-xs text-muted-foreground">{meeting.name}</span>
                                                <span className="block text-xs text-muted-foreground">
                                                    {formatWeekdayDateTime(new Date(meeting.dateTime), meeting.timezone, locale)}
                                                </span>
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </RailCard>

                    <RailCard title={t(`${type}.joinTitle`)}>
                        <p className="text-sm text-muted-foreground">{t(`${type}.joinBody`)}</p>
                        <Link
                            href="/about"
                            prefetch={false}
                            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--orange-deep))] hover:underline"
                        >
                            <Landmark className="h-4 w-4" aria-hidden />
                            {t('joinCta')}
                        </Link>
                    </RailCard>
                </aside>
            </div>
        </div>
    );
}
