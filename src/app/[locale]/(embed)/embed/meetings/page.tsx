import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCityCached, getCouncilMeetingsForCityPublicCached } from '@/lib/cache';
import { EmbedMeetingCard } from '@/components/embed/EmbedMeetingCard';
import { EmbedFooter } from '@/components/embed/EmbedFooter';
import {
    generateThemeVars,
    parseAccentColor,
    type EmbedMode,
    type EmbedRadius,
} from '@/lib/utils/embedTheme';
import { AdministrativeBodyType } from '@prisma/client';
import { env } from '@/env.mjs';
import './embed.css';

// Cache the page for 5 minutes at the CDN, serve stale for up to 1 hour while revalidating
export const revalidate = 300;

const VALID_BODY_TYPES = new Set<string>(['council', 'committee', 'community']);

interface EmbedMeetingsPageProps {
    params: { locale: string };
    searchParams: {
        cityId?: string;
        accent?: string;
        mode?: string;
        limit?: string;
        showSubjects?: string;
        radius?: string;
        bodies?: string;
    };
}

export default async function EmbedMeetingsPage({ params, searchParams }: EmbedMeetingsPageProps) {
    const { locale } = params;
    const { cityId } = searchParams;

    if (!cityId) notFound();

    const city = await getCityCached(cityId);
    if (!city) notFound();

    const accent = parseAccentColor(searchParams.accent);
    const mode: EmbedMode = searchParams.mode === 'dark' ? 'dark' : 'light';
    const limit = Math.min(Math.max(parseInt(searchParams.limit || '5', 10) || 5, 1), 10);
    const showSubjects = searchParams.showSubjects !== 'false';
    const radius: EmbedRadius =
        searchParams.radius === 'sharp' || searchParams.radius === 'pill'
            ? searchParams.radius
            : 'rounded';
    const bodyTypeFilter = (searchParams.bodies?.split(',').filter(Boolean) || [])
        .filter((v): v is AdministrativeBodyType => VALID_BODY_TYPES.has(v));
    const administrativeBodyTypes = bodyTypeFilter.length > 0 ? bodyTypeFilter : undefined;

    // Fetch upcoming (ASC, nearest first) and past (DESC, most recent first) in parallel.
    // Two queries are correct: a single DESC query would cut off the nearest upcoming
    // meetings when there are more upcoming than `limit`.
    const [upcomingAll, pastAll] = await Promise.all([
        getCouncilMeetingsForCityPublicCached(cityId, { limit, administrativeBodyTypes, timeFilter: 'upcoming' }),
        getCouncilMeetingsForCityPublicCached(cityId, { limit, administrativeBodyTypes, timeFilter: 'past' }),
    ]);

    // Prioritize upcoming; fill remaining slots with past meetings.
    const upcoming = upcomingAll.slice(0, limit);
    const past = pastAll.slice(0, Math.max(0, limit - upcoming.length));
    const hasAnyMeetings = upcoming.length + past.length > 0;

    const t = await getTranslations('EmbedWidget');
    const themeVars = generateThemeVars(accent, mode, radius);
    const baseUrl = env.NEXTAUTH_URL.replace(/\/$/, '');
    const cardTranslations = { subjects: t('subjects'), more: t('more') };

    const renderCards = (items: typeof upcoming) =>
        items.map((meeting) => (
            <EmbedMeetingCard
                key={meeting.id}
                meeting={meeting}
                locale={locale}
                showSubjects={showSubjects}
                baseUrl={baseUrl}
                cityTimezone={city.timezone}
                translations={cardTranslations}
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
                            {renderCards(upcoming)}
                        </>
                    )}
                    {past.length > 0 && (
                        <>
                            {upcoming.length > 0 && (
                                <div className="embed-section-label">{t('recent')}</div>
                            )}
                            {renderCards(past)}
                        </>
                    )}
                </div>
            )}

            <EmbedFooter baseUrl={baseUrl} cityId={cityId} />
        </div>
    );
}
