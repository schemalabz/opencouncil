import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCityCached } from '@/lib/cache';
import { EmbedMeetingSummary, type EmbedSummaryTranslations } from '@/components/embed/EmbedMeetingSummary';
import { EmbedFooter } from '@/components/embed/EmbedFooter';
import { parseEmbedConfig, parseBoundedInt, EMBED_SUMMARY_LIMITS, type EmbedSearchParams } from '@/lib/utils/embedParams';
import { embedBaseUrl } from '@/lib/utils/embedBaseUrl';
import { getMeetingSummaries } from '@/lib/meetingSummaries';
import '../meetings/embed.css';

// Cache the page for 5 minutes at the CDN, serve stale for up to 1 hour while revalidating
export const revalidate = 300;

interface EmbedSummaryPageProps {
    params: Promise<{ locale: string }>;
    searchParams: Promise<EmbedSearchParams & {
        cityId?: string;
        /** One specific meeting. Without it, `limit` latest past meetings are stacked. */
        meetingId?: string;
        /** Subject cards per meeting. */
        subjects?: string;
    }>;
}

/**
 * Meeting summary widget: one block per meeting with its most discussed
 * subjects, the meeting's stats and a single link to the full meeting page.
 */
export default async function EmbedSummaryPage(props: EmbedSummaryPageProps) {
    const searchParams = await props.searchParams;
    const { locale } = await props.params;
    const { cityId, meetingId } = searchParams;

    if (!cityId) notFound();

    const city = await getCityCached(cityId);
    if (!city) notFound();

    const { limit, administrativeBodyTypes, administrativeBodyIds, themeVars } =
        parseEmbedConfig(searchParams, { limit: EMBED_SUMMARY_LIMITS.meetings });
    const maxSubjects = parseBoundedInt(searchParams.subjects, EMBED_SUMMARY_LIMITS.subjects);
    const baseUrl = embedBaseUrl(city.realm);

    const summaries = await getMeetingSummaries(cityId, { meetingId, limit, administrativeBodyTypes, administrativeBodyIds });

    const t = await getTranslations('EmbedWidget');
    const translations: EmbedSummaryTranslations = {
        aiSummary: t('aiSummary'),
        fullMeeting: t('fullMeeting'),
        noSubjects: t('noSubjects'),
        subjectsCount: (count) => t('subjectsCount', { count }),
        speakersCount: (count) => t('speakersCount', { count }),
        hoursCount: (count) => t('hoursCount', { count }),
        minutesCount: (count) => t('minutesCount', { count }),
    };
    // A missing specific meeting and a city without past meetings read differently.
    const emptyText = meetingId ? t('noMeeting') : t('noMeetings');

    return (
        <div className="embed-widget" style={themeVars as React.CSSProperties}>
            {summaries.length === 0 ? (
                <div className="embed-empty">{emptyText}</div>
            ) : (
                <div className="embed-list">
                    {summaries.map((summary) => (
                        <EmbedMeetingSummary
                            key={summary.meeting.id}
                            summary={summary}
                            maxSubjects={maxSubjects}
                            locale={locale}
                            baseUrl={baseUrl}
                            cityTimezone={city.timezone}
                            translations={translations}
                        />
                    ))}
                </div>
            )}

            <EmbedFooter baseUrl={baseUrl} cityId={cityId} />
        </div>
    );
}
