"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Clock, MessageSquare, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PersonAvatarList } from "@/components/persons/PersonAvatarList";
import { buildSearchHref } from "@/components/search/searchFilterTypes";
import { useLocalizeText } from "@/hooks/useLocalizeText";
import { Link } from "@/i18n/routing";
import { captureEvent } from "@/lib/analytics/capture";
import { formatDate } from "@/lib/formatters/time";
import { getLocalizedName } from "@/lib/formatters/name";
import { subjectCardStats } from "@/lib/subjectCardStats";
import { subjectSpeakersFromStatistics } from "@/lib/subjectSpeakers";
import { subjectTitle } from "@/lib/subjectText";
import { cn } from "@/lib/utils";
import type { RelatedScope, SearchResultLight } from "@/lib/search/types";
import type { Statistics } from "@/lib/statistics";

export type RelatedSubject = SearchResultLight & { statistics?: Statistics };

/**
 * One level of related subjects. The statistics on each subject carry its
 * speakers with their roles, which is what the avatar row draws.
 */
export interface RelatedLevel {
    /** `city`: in meeting order, oldest first. `other`: as the index ranked them, closest first. */
    subjects: RelatedSubject[];
}

/** The subject on screen, as the timeline places it among its neighbours. */
export interface RelatedCurrent {
    dateTime: string;
    /** Already localized: the page has the locale, the section does not. */
    administrativeBodyName: string | null;
    timezone: string;
}

interface RelatedSubjectsProps {
    subjectId: string;
    subjectName: string;
    cityId: string;
    current: RelatedCurrent;
    /** Either level is absent when it has no subjects; the server renders nothing when both are. */
    city?: RelatedLevel;
    other?: RelatedLevel;
}

const subjectHref = (subject: RelatedSubject) => `/${subject.cityId}/${subject.councilMeetingId}/subjects/${subject.id}`;

type OpenHandler = (subject: RelatedSubject, scope: RelatedScope, rank: number) => () => void;

function Subhead({ children, count }: { children: React.ReactNode; count: number }) {
    return (
        <h3 className="mt-4 text-[13px] font-semibold text-muted-foreground">
            {children} <span className="font-normal">({count})</span>
        </h3>
    );
}

function RowStats({ statistics, fallbackSpeakerCount }: { statistics?: Statistics; fallbackSpeakerCount?: number }) {
    const t = useTranslations("Subject");
    const stats = subjectCardStats(statistics, fallbackSpeakerCount);
    if (stats.minutes === 0 && stats.speakerCount === 0 && stats.partyDots.length === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {stats.minutes > 0 && (
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />{t("minutesCount", { count: stats.minutes })}</span>
            )}
            {stats.speakerCount > 0 && (
                <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden />{stats.speakerCount}</span>
            )}
            {stats.partyDots.length > 0 && (
                <span className="flex shrink-0 items-center gap-1">
                    {stats.partyDots.map(p => (
                        <span key={p.id} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.colorHex }} title={p.name} />
                    ))}
                </span>
            )}
        </div>
    );
}

/** The line above a timeline entry: when, and before which body. */
function EntryContext({ date, body, current }: { date: string; body: string | null; current?: boolean }) {
    const t = useTranslations("Subject");
    return (
        <div className={cn(
            "flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-semibold",
            current ? "text-[hsl(var(--orange))]" : "text-muted-foreground",
        )}>
            <span>{date}</span>
            {body && (
                <>
                    <span aria-hidden="true">·</span>
                    <span>{body}</span>
                </>
            )}
            {current && (
                <span className="rounded bg-[hsl(var(--orange))]/10 px-1.5 py-0.5 text-[10.5px] font-extrabold tracking-[.04em]">
                    {t("relatedCurrent")}
                </span>
            )}
        </div>
    );
}

type TimelineEntry =
    | { kind: 'related'; subject: RelatedSubject; rank: number; date: Date }
    | { kind: 'current'; date: Date };

/**
 * The same municipality's neighbours as a timeline, with the subject on
 * screen placed among them by its meeting's date. A recurring agenda item
 * has a history, and the reader sees at a glance what came before this
 * meeting and what came after — a list in similarity order cannot show that.
 * The subject on screen is a marker, not a link: it is the page.
 */
function RelatedTimeline({ level, current, currentName, onOpen }: {
    level: RelatedLevel;
    current: RelatedCurrent;
    currentName: string;
    onOpen: OpenHandler;
}) {
    const t = useTranslations("Subject");
    const locale = useLocale();
    const localize = useLocalizeText();

    const entries: TimelineEntry[] = [
        ...level.subjects.map((subject, rank): TimelineEntry => ({
            kind: 'related', subject, rank, date: new Date(subject.councilMeeting.dateTime),
        })),
        { kind: 'current' as const, date: new Date(current.dateTime) },
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    return (
        <>
            <Subhead count={level.subjects.length}>{t("relatedSameCity")}</Subhead>
            <div className="relative mt-3.5">
                {/* The rail runs behind the dots. The dots are 14px, so it sits at their
                    centre, 6px in, and stops inside the first and last of them. */}
                <span aria-hidden="true" className="absolute bottom-2 left-[6px] top-3 w-0.5 bg-border" />
                <ol className="m-0 list-none p-0">
                    {entries.map(entry => {
                        if (entry.kind === 'current') {
                            return (
                                <li key="current" className="relative flex gap-5 pb-6 last:pb-0">
                                    <span aria-hidden="true" className="relative z-[1] mt-[3px] h-3.5 w-3.5 shrink-0 rounded-full bg-[hsl(var(--orange))] ring-2 ring-[hsl(var(--orange))]/35 ring-offset-[3px] ring-offset-background" />
                                    <div className="flex min-w-0 flex-col gap-1">
                                        <EntryContext
                                            date={formatDate(entry.date, current.timezone, locale)}
                                            body={current.administrativeBodyName}
                                            current
                                        />
                                        <div className="text-[15px] font-semibold leading-snug">{currentName}</div>
                                    </div>
                                </li>
                            );
                        }
                        const { subject, rank } = entry;
                        const body = subject.councilMeeting.administrativeBody;
                        return (
                            <li key={subject.id} className="relative flex gap-5 pb-6 last:pb-0">
                                <span aria-hidden="true" className="relative z-[1] mt-[3px] h-3.5 w-3.5 shrink-0 rounded-full border-2 border-foreground/30 bg-background" />
                                <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
                                    <div className="flex min-w-0 flex-col gap-1">
                                        <EntryContext
                                            date={formatDate(entry.date, subject.councilMeeting.city.timezone, locale)}
                                            body={body ? getLocalizedName(body, locale) : null}
                                        />
                                        <Link
                                            href={subjectHref(subject)}
                                            prefetch={false}
                                            onClick={onOpen(subject, 'city', rank)}
                                            className="text-[15px] font-semibold leading-snug transition-colors hover:text-[hsl(var(--orange))] hover:no-underline"
                                        >
                                            {subjectTitle(subject, localize)}
                                        </Link>
                                        <RowStats statistics={subject.statistics} fallbackSpeakerCount={subject.contributions?.length} />
                                    </div>
                                    <PersonAvatarList
                                        users={subjectSpeakersFromStatistics(subject.statistics, subject.introducedBy)}
                                        introducerId={subject.introducedBy?.id}
                                        size="sm"
                                        maxDisplayed={4}
                                        stacked
                                    />
                                </div>
                            </li>
                        );
                    })}
                </ol>
            </div>
        </>
    );
}

/**
 * The other municipalities' neighbours as a compact two-column list. Place
 * is their axis, not time, so each row leads with its municipality — the
 * logo and the name — and names the body it came before; similarity is not
 * geographic, so the index's order stands.
 */
function RelatedElsewhere({ level, onOpen }: { level: RelatedLevel; onOpen: OpenHandler }) {
    const t = useTranslations("Subject");
    const locale = useLocale();
    const localize = useLocalizeText();

    return (
        <>
            <Subhead count={level.subjects.length}>{t("relatedOtherCities")}</Subhead>
            <ul className="m-0 mt-1 grid list-none grid-cols-1 gap-x-8 p-0 sm:grid-cols-2">
                {level.subjects.map((subject, rank) => {
                    const city = subject.councilMeeting.city;
                    const body = subject.councilMeeting.administrativeBody;
                    return (
                        <li key={subject.id} className="border-b border-border">
                            <Link
                                href={subjectHref(subject)}
                                prefetch={false}
                                onClick={onOpen(subject, 'other', rank)}
                                className="group/row flex gap-2.5 py-3 hover:no-underline"
                            >
                                <Image
                                    src={city.logoImage || '/default-city-logo.jpg'}
                                    alt=""
                                    width={28}
                                    height={28}
                                    className="mt-0.5 h-7 w-7 shrink-0 rounded-full border border-border bg-background object-contain p-px"
                                />
                                <div className="flex min-w-0 flex-col gap-1">
                                    <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                                        <span className="font-semibold text-foreground">{getLocalizedName(city, locale)}</span>
                                        <span aria-hidden="true">·</span>
                                        <span>{formatDate(new Date(subject.councilMeeting.dateTime), city.timezone, locale)}</span>
                                        {body && (
                                            <>
                                                <span aria-hidden="true">·</span>
                                                <span>{getLocalizedName(body, locale)}</span>
                                            </>
                                        )}
                                    </div>
                                    <div className="line-clamp-2 text-sm font-semibold leading-snug transition-colors group-hover/row:text-[hsl(var(--orange))]">
                                        {subjectTitle(subject, localize)}
                                    </div>
                                    <RowStats statistics={subject.statistics} fallbackSpeakerCount={subject.contributions?.length} />
                                </div>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </>
    );
}

/**
 * The subjects most similar to this one, in two shapes: the same
 * municipality's as a timeline the subject on screen sits on, the other
 * municipalities' as a compact list led by each municipality. The button at
 * the end opens the search with the subject's own title as the query.
 *
 * The data arrives from the server (RelatedSubjectsSection), which also
 * decides whether the section exists at all and passes a level only when it
 * has subjects.
 */
export function RelatedSubjects({ subjectId, subjectName, cityId, current, city, other }: RelatedSubjectsProps) {
    const t = useTranslations("Subject");
    const localize = useLocalizeText();

    // The impression that the click events are read against. The section sits
    // below the fold, so it counts when the reader scrolls to it, not when the
    // page mounts: a mount event would make every page view a denominator.
    // Once per mount, whatever the observer does afterwards.
    const sectionRef = useRef<HTMLElement>(null);
    const seen = useRef(false);
    const cityCount = city?.subjects.length ?? 0;
    const otherCount = other?.subjects.length ?? 0;
    useEffect(() => {
        const el = sectionRef.current;
        if (!el || seen.current) return;
        const report = () => {
            if (seen.current) return;
            seen.current = true;
            captureEvent("related_subjects_shown", { subject_id: subjectId, city_id: cityId, city_count: cityCount, other_count: otherCount });
        };
        if (typeof IntersectionObserver === 'undefined') {
            report();
            return;
        }
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                report();
                observer.disconnect();
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [subjectId, cityId, cityCount, otherCount]);

    const onOpen: OpenHandler = (subject, scope, rank) => () => captureEvent("subject_opened", {
        surface: 'related_subjects',
        subject_id: subject.id,
        city_id: subject.cityId,
        meeting_id: subject.councilMeetingId,
        from_subject_id: subjectId,
        scope,
        rank,
    });

    // The search box shows the query, so it carries the title in the reader's
    // script; the index was asked with the authored one.
    const searchHref = buildSearchHref({ query: localize(subjectName) });

    return (
        <section ref={sectionRef}>
            <h2 className="!m-0 !text-left tracking-[.01em]">{t("relatedSubjects")}</h2>
            {city && <RelatedTimeline level={city} current={current} currentName={localize(subjectName)} onOpen={onOpen} />}
            {other && <RelatedElsewhere level={other} onOpen={onOpen} />}
            <div className="mt-4 flex justify-end">
                <Button asChild variant="outline" size="sm">
                    <Link
                        href={searchHref}
                        onClick={() => captureEvent("subject_action", { action: 'search_related', subject_id: subjectId, city_id: cityId })}
                    >
                        <Search className="h-4 w-4 mr-2" aria-hidden="true" />
                        {t("relatedSeeMore")}
                    </Link>
                </Button>
            </div>
        </section>
    );
}
