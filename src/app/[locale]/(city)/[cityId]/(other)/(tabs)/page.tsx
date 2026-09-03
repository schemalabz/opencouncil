import { notFound } from "next/navigation";
import { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import MeetingCardV2 from "@/components/meetings/MeetingCardV2";
import { MeetingsTimeline } from "@/components/cities/overview/MeetingsTimeline";
import { HotTopicsCard } from "@/components/cities/overview/HotTopicsCard";
import { CouncilBand } from "@/components/cities/overview/CouncilBand";
import { getAdministrativeBodiesWithPublicMeetingsCached, getCityCached, getCouncilMeetingsPreviewPublicCached, getPartiesForCityCached, getPeopleForCityCached } from "@/lib/cache";
import { HOT_PERIODS, HOT_SCOPES, periodStart, readPeriod, readScope, type HotScope } from "@/lib/utils/hotTopicFilters";
import { getHotSubjectCardsCached } from "@/lib/hotSubjectCards";
import { buildCanonicalAlternates } from "@/lib/utils/hreflang";
import { getLocalizedName } from "@/lib/formatters/name";
import { getOgLocale } from '@/i18n/config';
import { getTranslations } from 'next-intl/server';
import { buildOgImageUrl } from '@/lib/og/locale';
import { Link } from '@/i18n/routing';

/** How far down the ranking the overview goes before it stops being a summary. */
const HOT_SUBJECTS = 7;
/** Enough recent meetings to show the council's rhythm; the rest are one click away. */
const RECENT_MEETINGS = 6;
/** Scheduled meetings the timeline shows above "now" — their agendas are already published. */
const UPCOMING_MEETINGS = 2;

export async function generateMetadata(
    props: {
        params: Promise<{ cityId: string; locale: string }>
    }
): Promise<Metadata> {
    const params = await props.params;

    const {
        cityId,
        locale
    } = params;

    const city = await getCityCached(cityId);
    const t = await getTranslations({ locale, namespace: 'metadata.city' });

    if (!city) {
        return {
            title: t('notFoundTitle'),
            description: t('notFoundDescription'),
            alternates: await buildCanonicalAlternates(`/${cityId}`),
        };
    }

    const cityName = getLocalizedName(city, locale);
    const description = t('description', { cityName });
    const ogImageUrl = buildOgImageUrl(locale, { cityId });

    return {
        title: `${cityName} | OpenCouncil`,
        description,
        keywords: [cityName, ...(t.raw('keywords') as string[]), "OpenCouncil"],
        authors: [{ name: t('author', { cityName }) }],
        openGraph: {
            title: `${cityName} | OpenCouncil`,
            description,
            type: "website",
            siteName: "OpenCouncil",
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: t('ogAlt', { cityName }),
                },
            ],
            locale: getOgLocale(locale),
        },
        twitter: {
            card: "summary_large_image",
            title: `${cityName} | OpenCouncil`,
            description,
            images: [ogImageUrl],
        },
        alternates: await buildCanonicalAlternates(`/${cityId}`),
    };
}

/**
 * The page binds its translator inside a Promise.all longer than the key scan
 * reads, so the namespace is stated here for it.
 * @translationNamespace cityOverview
 */
export default async function CityOverviewPage(
    props: {
        params: Promise<{ cityId: string; locale: string }>;
        searchParams: Promise<{ scope?: string; period?: string }>;
    }
) {
    const [params, search] = await Promise.all([props.params, props.searchParams]);

    const {
        cityId,
        locale
    } = params;

    const requestedScope = readScope(search.scope);
    const period = readPeriod(search.period);

    // The roster is read here rather than in the layout: only this tab renders it,
    // and CouncilBand is a Server Component, so none of it reaches the client.
    // The city comes first (a warm cached read — generateMetadata has already
    // primed it): the realm decides what the meetings section fetches. The
    // Greek timeline shows only δήμος-wide bodies, so κοινότητες must not eat
    // window slots — and it alone has an upcoming module to fetch for.
    const city = await getCityCached(cityId);
    if (!city) {
        notFound();
    }

    // The two-sided timeline is the ΔΕ/ΔΣ shape of Greek local government;
    // other realms keep the meeting cards.
    const meetingsAsTimeline = city.realm === 'greece';
    const timelineBodyTypes = meetingsAsTimeline ? (['council', 'committee'] as const) : undefined;

    const [hotCards, recentMeetings, upcomingMeetings, parties, people, bodies, t] = await Promise.all([
        getHotSubjectCardsCached(cityId, {
            limit: HOT_SUBJECTS,
            administrativeBodyTypes: HOT_SCOPES[requestedScope].types,
            months: HOT_PERIODS[period].months,
        }),
        getCouncilMeetingsPreviewPublicCached(cityId, {
            limit: RECENT_MEETINGS,
            timeFilter: 'past',
            ...(timelineBodyTypes && { administrativeBodyTypes: [...timelineBodyTypes] }),
        }),
        meetingsAsTimeline
            ? getCouncilMeetingsPreviewPublicCached(cityId, {
                limit: UPCOMING_MEETINGS,
                timeFilter: 'upcoming',
                administrativeBodyTypes: [...timelineBodyTypes!],
            })
            : Promise.resolve([]),
        getPartiesForCityCached(cityId),
        getPeopleForCityCached(cityId),
        getAdministrativeBodiesWithPublicMeetingsCached(cityId),
        getTranslations({ locale, namespace: 'cityOverview' }),
    ]);

    // Offer only the scopes this municipality has bodies for — a picker that can
    // select an always-empty ranking is worse than no picker.
    const presentTypes = new Set(bodies.map(body => body.type));
    const availableScopes = (Object.keys(HOT_SCOPES) as HotScope[]).filter(value => {
        const types = HOT_SCOPES[value].types;
        return !types || types.some(type => presentTypes.has(type));
    });

    // `CouncilMeeting.administrativeBodyId` is nullable, so a city can have public
    // meetings and still no body of the default scope's type — which would rank
    // nothing at all. Widen to every body and let the picker show what applies.
    const scope = availableScopes.includes(requestedScope) ? requestedScope : 'all';
    const hotSubjects = scope === requestedScope
        ? hotCards
        : await getHotSubjectCardsCached(cityId, { limit: HOT_SUBJECTS, months: HOT_PERIODS[period].months });

    // The ranking falls back to the most recent meetings when the chosen period
    // holds none — say so rather than letting the dates quietly contradict the
    // picker.
    const windowStart = periodStart(period);
    const beyondPeriod =
        windowStart !== null &&
        hotSubjects.length > 0 &&
        hotSubjects.every(card => new Date(card.meeting.dateTime) < windowStart);

    return (
        <div className="space-y-12">
            <HotTopicsCard
                cards={hotSubjects}
                cityId={cityId}
                timezone={city.timezone}
                locale={locale}
                scope={scope}
                period={period}
                availableScopes={availableScopes}
                beyondPeriod={beyondPeriod}
            />

            {(recentMeetings.length > 0 || (meetingsAsTimeline && upcomingMeetings.length > 0)) && (
                <section>
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                                {t('recentMeetingsEyebrow')}
                            </span>
                            <h2 className="mt-2.5 !text-left tracking-tight">
                                {meetingsAsTimeline ? t('timelineTitle') : t('recentMeetingsTitle')}
                            </h2>
                        </div>
                        <Link
                            href={`/${cityId}/meetings`}
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--orange))]"
                        >
                            {t('allMeetings')}
                            <ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                    </div>

                    {meetingsAsTimeline ? (
                        <div className="mt-6">
                            <MeetingsTimeline
                                upcoming={upcomingMeetings}
                                recent={recentMeetings}
                                timezone={city.timezone}
                                locale={locale}
                            />
                        </div>
                    ) : (
                        /* Two columns, and no third. A meeting card carries a body name, a title, a
                           date line and three subject rows; at a third of this column — which the
                           rail already narrows — every one of them truncated. Six cards read as
                           three rows rather than two, which is the better trade. */
                        <div className="mt-6 grid gap-6 sm:grid-cols-2">
                            {recentMeetings.map(meeting => (
                                <MeetingCardV2
                                    key={meeting.id}
                                    item={meeting}
                                    editable={false}
                                    cityTimezone={city.timezone}
                                />
                            ))}
                        </div>
                    )}
                </section>
            )}

            <CouncilBand parties={parties} people={people} city={city} locale={locale} />
        </div>
    );
}
