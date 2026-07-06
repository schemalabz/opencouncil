import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCityCached, getCouncilMeetingsForCityPublicCached } from '@/lib/cache';
import { EmbedMeetingCard } from '@/components/embed/EmbedMeetingCard';
import { EmbedFooter } from '@/components/embed/EmbedFooter';
import { parseEmbedConfig, type EmbedSearchParams } from '@/lib/utils/embedParams';
import './embed.css';

// Cache the page for 5 minutes at the CDN, serve stale for up to 1 hour while revalidating
export const revalidate = 300;

interface EmbedMeetingsPageProps {
    params: Promise<{ locale: string }>;
    searchParams: Promise<EmbedSearchParams & {
        cityId?: string;
        showSubjects?: string;
    }>;
}

export default async function EmbedMeetingsPage(props: EmbedMeetingsPageProps) {
    const searchParams = await props.searchParams;
    const params = await props.params;
    const { locale } = params;
    const { cityId } = searchParams;

    if (!cityId) notFound();

    const city = await getCityCached(cityId);
    if (!city) notFound();

    const { limit, administrativeBodyTypes, administrativeBodyIds, themeVars, baseUrl } = parseEmbedConfig(searchParams);
    const showSubjects = searchParams.showSubjects !== 'false';

    // Fetch upcoming (ASC, nearest first) and past (DESC, most recent first) in parallel.
    // Two queries are correct: a single DESC query would cut off the nearest upcoming
    // meetings when there are more upcoming than `limit`.
    const [upcomingAll, pastAll] = await Promise.all([
        getCouncilMeetingsForCityPublicCached(cityId, { limit, administrativeBodyTypes, administrativeBodyIds, timeFilter: 'upcoming' }),
        getCouncilMeetingsForCityPublicCached(cityId, { limit, administrativeBodyTypes, administrativeBodyIds, timeFilter: 'past' }),
    ]);

    // Prioritize upcoming; fill remaining slots with past meetings.
    const upcoming = upcomingAll.slice(0, limit);
    const past = pastAll.slice(0, Math.max(0, limit - upcoming.length));
    const hasAnyMeetings = upcoming.length + past.length > 0;

    const t = await getTranslations('EmbedWidget');
    const cardTranslations = { subjects: t('subjects'), more: t('more'), watchLive: t('watchLive') };

    const renderCards = (items: typeof upcoming, isUpcoming: boolean) =>
        items.map((meeting) => (
            <EmbedMeetingCard
                key={meeting.id}
                meeting={meeting}
                locale={locale}
                showSubjects={showSubjects}
                baseUrl={baseUrl}
                cityTimezone={city.timezone}
                translations={cardTranslations}
                isUpcoming={isUpcoming}
            />
        ));

    return (
        <div className="embed-widget" style={themeVars as React.CSSProperties}>
            {!hasAnyMeetings ? (
                <div className="embed-empty">{t('noMeetings')}</div>
            ) : (
                <div className="embed-list">
                    {upcoming.length > 0 && (
                        <>
                            <div className="embed-section-label">{t('upcoming')}</div>
                            {renderCards(upcoming, true)}
                        </>
                    )}
                    {past.length > 0 && (
                        <>
                            {upcoming.length > 0 && (
                                <div className="embed-section-label">{t('recent')}</div>
                            )}
                            {renderCards(past, false)}
                        </>
                    )}
                </div>
            )}

            <EmbedFooter baseUrl={baseUrl} cityId={cityId} />
        </div>
    );
}
