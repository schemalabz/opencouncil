import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCityCached, getCityIdForGeohashCached } from '@/lib/cache';
import { EmbedSubjectCard } from '@/components/embed/EmbedSubjectCard';
import { EmbedFooter } from '@/components/embed/EmbedFooter';
import { parseEmbedConfig, type EmbedSearchParams } from '@/lib/utils/embedParams';
import { getHotSubjectCards } from '@/lib/hotSubjectCards';
import { isValidGeohash } from '@/lib/geo';
import { cn } from '@/lib/utils';
import '../meetings/embed.css';

// Cache the page for 5 minutes at the CDN, serve stale for up to 1 hour while revalidating
export const revalidate = 300;

interface EmbedSubjectsPageProps {
    params: Promise<{ locale: string }>;
    searchParams: Promise<EmbedSearchParams & { cityId?: string; geohash?: string }>;
}

export default async function EmbedSubjectsPage(props: EmbedSubjectsPageProps) {
    const searchParams = await props.searchParams;
    const { locale } = await props.params;

    // Optional location filter: a valid geohash-6 restricts to subjects within
    // 500m of the cell center (plus municipality-wide, no-location subjects).
    const geohash = searchParams.geohash && isValidGeohash(searchParams.geohash)
        ? searchParams.geohash.toLowerCase()
        : null;

    // cityId is optional when a geohash is given: resolve the municipality that
    // contains the cell center. A geohash outside every covered municipality
    // renders the empty state rather than a 404 inside the iframe.
    if (!searchParams.cityId && !geohash) notFound();
    const cityId = searchParams.cityId ?? (geohash ? await getCityIdForGeohashCached(geohash) : null);

    const city = cityId ? await getCityCached(cityId) : null;
    // An explicitly provided cityId must exist (unchanged behavior).
    if (searchParams.cityId && !city) notFound();

    const { limit, administrativeBodyTypes, administrativeBodyIds, themeVars, appThemeShim, baseUrl } = parseEmbedConfig(searchParams);

    const cards = city
        ? await getHotSubjectCards(city.id, { limit, administrativeBodyTypes, administrativeBodyIds, geohash })
        : [];

    const t = await getTranslations('EmbedWidget');

    // The shared SubjectCardContent uses the app's design tokens, so apply the
    // token shim (dark class + accent/radius) alongside the embed vars.
    return (
        <div
            className={cn('embed-widget', appThemeShim.dark && 'dark')}
            style={{ ...themeVars, ...appThemeShim.vars } as React.CSSProperties}
        >
            {cards.length === 0 ? (
                <div className="embed-empty">{t('noSubjects')}</div>
            ) : (
                <div className="embed-subjects">
                    <div className="embed-section-label">{t('hotSubjects')}</div>
                    <div className="embed-subject-grid">
                        {cards.map(({ subject, meeting, locationText, speakers, stats }) => (
                            <EmbedSubjectCard
                                key={subject.id}
                                subject={subject}
                                meeting={meeting}
                                locationText={locationText}
                                speakers={speakers}
                                stats={stats}
                                locale={locale}
                                baseUrl={baseUrl}
                                cityTimezone={city?.timezone}
                            />
                        ))}
                    </div>
                </div>
            )}

            <EmbedFooter baseUrl={baseUrl} cityId={city?.id} />
        </div>
    );
}
