import { Metadata } from "next";
import { cache } from "react";
import Subject from "@/components/meetings/subject/subject";
import SubjectReadTracker from "@/components/analytics/SubjectReadTracker";
import { getMeetingDataCached, getSubjectFromMeetingCached } from "@/lib/getMeetingData";
import { notFound } from "next/navigation";
import { buildCanonicalAlternates } from "@/lib/utils/hreflang";
import { getLocalizedName } from "@/lib/formatters/name";
import { localizeText } from "@/lib/serbian";
import { compactMetadataDescription } from "@/lib/seo/metadataDescription";
import { getRealm, getRealmBaseUrlFromRequest } from "@/lib/realm.server";
import { buildSubjectStructuredData, serializeStructuredData } from "@/lib/seo/subjectStructuredData";
import { formatNumericDate } from '@/lib/formatters/time';
import { getPublicContribution } from '@/lib/sharing/contributions';
import { contributionMetadata } from '@/lib/sharing/contributionMetadata';
import type { QueryParams } from '@/lib/sharing/excerptSelector';

interface SubjectPageProps {
    params: Promise<{ cityId: string; meetingId: string; subjectId: string; locale: string }>;
    searchParams?: Promise<QueryParams>;
}
const resolveSharedContribution = cache(async (id: string, cityId: string, meetingId: string, subjectId: string, locale: string) => {
    const contribution = await getPublicContribution(id, await getRealm(), locale);
    return contribution?.meeting.cityId === cityId && contribution.meeting.id === meetingId && contribution.subject.id === subjectId ? contribution : null;
});
async function selectedContribution(props: SubjectPageProps) {
    const [{ contribution }, params] = await Promise.all([props.searchParams ?? Promise.resolve({} as QueryParams), props.params]);
    return typeof contribution === 'string' ? resolveSharedContribution(contribution, params.cityId, params.meetingId, params.subjectId, params.locale) : null;
}

export async function generateMetadata(
    props: SubjectPageProps
): Promise<Metadata> {
    const params = await props.params;
    // First try to get the subject from the cached meeting data
    const subject = await getSubjectFromMeetingCached(params.cityId, params.meetingId, params.subjectId);

    if (!subject) {
        // Dead subject IDs (subjects are regenerated when a meeting is
        // reprocessed) can't produce a real 404: the page renders below the
        // meeting loading.tsx Suspense boundary, so the 200 shell is already
        // flushed when notFound() throws. Explicit noindex metadata is the
        // reliable signal — htmlLimitedBots (next.config.mjs) puts it in the
        // blocking <head> for crawlers. The page body still calls notFound()
        // for the UI. The nulls clear the meeting layout's inherited
        // canonical/OG/Twitter tags, which would otherwise describe the parent
        // meeting on a noindex URL (and risk the noindex signal being applied
        // to the canonical target).
        return {
            title: 'Not Found',
            robots: { index: false, follow: false },
            alternates: null,
            openGraph: null,
            twitter: null,
        };
    }

    // Get the full meeting data for city information
    const meetingData = await getMeetingDataCached(params.cityId, params.meetingId);

    const subjectName = localizeText(subject.name, params.locale);

    if (!meetingData) {
        return { title: subjectName };
    }

    // Create a concise title
    const cityName = getLocalizedName(meetingData.city, params.locale);
    const title = `${cityName} - ${subjectName} | OpenCouncil`;

    // Create a meaningful description
    const description = subject.description
        ? compactMetadataDescription(localizeText(subject.description, params.locale))
        : `Θέμα που συζητήθηκε | ${cityName} | ${formatNumericDate(new Date(meetingData.meeting.dateTime), meetingData.city.timezone)}`;

    const shared = await selectedContribution(props);
    const sharedMetadata = shared ? await contributionMetadata(shared, params.locale) : {};
    return {
        title,
        description,
        alternates: await buildCanonicalAlternates(
            `/${params.cityId}/${params.meetingId}/subjects/${params.subjectId}`
        ),
        openGraph: {
            title,
            description,
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
        },
        ...sharedMetadata,
    };
}

// Server component that renders the Subject component
export default async function SubjectPage(
    props: SubjectPageProps
) {
    const params = await props.params;

    // Also checked in generateMetadata, but the 404 must not depend on the
    // metadata path alone (metadata streams for regular browsers).
    const subject = await getSubjectFromMeetingCached(params.cityId, params.meetingId, params.subjectId);
    if (!subject) {
        notFound();
    }

    const [meetingData, baseUrl, shared] = await Promise.all([
        getMeetingDataCached(params.cityId, params.meetingId),
        getRealmBaseUrlFromRequest(),
        selectedContribution(props),
    ]);
    if (!meetingData) {
        notFound();
    }

    const structuredData = buildSubjectStructuredData({
        canonicalUrl: `${baseUrl}/${params.cityId}/${params.meetingId}/subjects/${params.subjectId}`,
        siteUrl: baseUrl,
        locale: params.locale,
        subjectName: localizeText(subject.name, params.locale),
        subjectDescription: compactMetadataDescription(
            localizeText(subject.description, params.locale),
            500
        ),
        subjectCreatedAt: subject.createdAt,
        subjectUpdatedAt: subject.updatedAt,
        cityName: getLocalizedName(meetingData.city, params.locale),
        meetingName: getLocalizedName(meetingData.meeting, params.locale),
        meetingDate: meetingData.meeting.dateTime,
        administrativeBodyName: meetingData.meeting.administrativeBody
            ? getLocalizedName(meetingData.meeting.administrativeBody, params.locale)
            : null,
        topicName: subject.topic ? getLocalizedName(subject.topic, params.locale) : null,
        citations: [...new Set(subject.contextCitationUrls)],
    });

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: serializeStructuredData(structuredData) }}
            />
            <SubjectReadTracker
                cityId={params.cityId}
                meetingId={params.meetingId}
                subjectId={params.subjectId}
            />
            <Subject subjectId={params.subjectId} highlightedContributionId={shared?.id} />
        </>
    );
}
