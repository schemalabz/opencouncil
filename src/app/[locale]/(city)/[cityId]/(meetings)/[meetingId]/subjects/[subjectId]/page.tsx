import { Metadata } from "next";
import Subject from "@/components/meetings/subject/subject";
import SubjectReadTracker from "@/components/analytics/SubjectReadTracker";
import { getMeetingDataCached, getSubjectFromMeetingCached } from "@/lib/getMeetingData";
import { notFound } from "next/navigation";
import { buildCanonicalAlternates } from "@/lib/utils/hreflang";
import { getLocalizedName } from "@/lib/formatters/name";
import { localizeText } from "@/lib/serbian";
import { compactMetadataDescription } from "@/lib/seo/metadataDescription";
import { getRealmBaseUrlFromRequest } from "@/lib/realm.server";
import { buildSubjectStructuredData, serializeStructuredData } from "@/lib/seo/subjectStructuredData";

export async function generateMetadata(
    props: {
        params: Promise<{ cityId: string; meetingId: string; subjectId: string; locale: string }>;
    }
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
        : `Θέμα που συζητήθηκε | ${cityName} | ${new Date(meetingData.meeting.dateTime).toLocaleDateString("el-GR")}`;

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
    };
}

// Server component that renders the Subject component
export default async function SubjectPage(
    props: { params: Promise<{ cityId: string; meetingId: string; subjectId: string; locale: string }> }
) {
    const params = await props.params;

    // Also checked in generateMetadata, but the 404 must not depend on the
    // metadata path alone (metadata streams for regular browsers).
    const subject = await getSubjectFromMeetingCached(params.cityId, params.meetingId, params.subjectId);
    if (!subject) {
        notFound();
    }

    const [meetingData, baseUrl] = await Promise.all([
        getMeetingDataCached(params.cityId, params.meetingId),
        getRealmBaseUrlFromRequest(),
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
            <Subject subjectId={params.subjectId} />
        </>
    );
}
