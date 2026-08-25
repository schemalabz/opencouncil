import { notFound } from "next/navigation";
import { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import MeetingCardV2 from "@/components/meetings/MeetingCardV2";
import { HotTopicsCard } from "@/components/cities/overview/HotTopicsCard";
import { getCityCached, getCouncilMeetingsForCityPublicCached } from "@/lib/cache";
import { getHotSubjectCards } from "@/lib/hotSubjectCards";
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

export default async function CityOverviewPage(
    props: {
        params: Promise<{ cityId: string; locale: string }>;
    }
) {
    const params = await props.params;

    const {
        cityId,
        locale
    } = params;

    const [city, hotCards, recentMeetings, t] = await Promise.all([
        getCityCached(cityId),
        getHotSubjectCards(cityId, { limit: HOT_SUBJECTS }),
        getCouncilMeetingsForCityPublicCached(cityId, { limit: RECENT_MEETINGS, timeFilter: 'past' }),
        getTranslations({ locale, namespace: 'cityOverview' }),
    ]);

    if (!city) {
        notFound();
    }

    return (
        <div className="space-y-12">
            <HotTopicsCard cards={hotCards} cityId={cityId} timezone={city.timezone} locale={locale} />

            {recentMeetings.length > 0 && (
                <section>
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
                                {t('recentMeetingsEyebrow')}
                            </span>
                            <h2 className="mt-2.5 !text-left text-2xl tracking-tight md:text-3xl">{t('recentMeetingsTitle')}</h2>
                        </div>
                        <Link
                            href={`/${cityId}/meetings`}
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--orange))]"
                        >
                            {t('allMeetings')}
                            <ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                    </div>

                    <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {recentMeetings.map(meeting => (
                            <MeetingCardV2
                                key={meeting.id}
                                item={meeting}
                                editable={false}
                                cityTimezone={city.timezone}
                            />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
