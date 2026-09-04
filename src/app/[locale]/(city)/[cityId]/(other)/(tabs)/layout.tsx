import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Loader2 } from "lucide-react";
import { CityIdentityBand } from "@/components/cities/CityIdentityBand";
import { CityRail } from "@/components/cities/CityRail";
import { CityNavigation } from "@/components/cities/CityNavigation";
import type { DatedMeeting, MeetingBookends } from "@/components/cities/overview/CityMeetingsModule";
import { stageChipDetail } from "@/components/meetings/stage/stageDetail";
import { getCityCached, getCityMessageCached, getCityPetitionBucketCached, getCouncilMeetingsPreviewPublicCached, getSubjectCountForCityCached } from "@/lib/cache";
import { isPetitionable } from "@/lib/cityStatus";
import { getCurrentUser, isUserAuthorizedToEdit } from "@/lib/auth";
import type { CouncilMeetingWithSubjectPreview } from "@/lib/db/meetings";
import { getNotificationPreferenceForCity } from "@/lib/db/notifications";
import { publicMeetingStage, stageSignalsFromPreview } from "@/lib/meetingStage";

export default async function TabsLayout(
    props: {
        children: React.ReactNode,
        params: Promise<{ locale: string, cityId: string }>
    }
) {
    const params = await props.params;

    const {
        locale,
        cityId
    } = params;

    const {
        children
    } = props;

    // The two bookend meetings are queried separately rather than sliced from one
    // list: 'upcoming' sorts ascending and 'past' descending, so a single ordering
    // cannot put both at the front.
    //
    // Both scopes are fetched up front so the band's scope switch is instant. All
    // four are cached and narrow (limit 1), and the council-only pair is what the
    // page shows for cities whose committees meet far more often than the council.
    // The petition bucket chains on the city: the rail's petition card reads it
    // on a city we do not cover yet, and a supported city has no card to read it.
    const cityPromise = getCityCached(cityId);
    const currentUserPromise = getCurrentUser();
    const [city, cityMessage, currentUser, canEdit, upcoming, past, councilUpcoming, councilPast, subjectCount, petitionBucket, tStage, notificationPreference] = await Promise.all([
        cityPromise,
        getCityMessageCached(cityId),
        currentUserPromise,
        isUserAuthorizedToEdit({ cityId }),
        getCouncilMeetingsPreviewPublicCached(cityId, { timeFilter: 'upcoming', limit: 1 }),
        getCouncilMeetingsPreviewPublicCached(cityId, { timeFilter: 'past', limit: 1 }),
        getCouncilMeetingsPreviewPublicCached(cityId, { timeFilter: 'upcoming', limit: 1, administrativeBodyTypes: ['council'] }),
        getCouncilMeetingsPreviewPublicCached(cityId, { timeFilter: 'past', limit: 1, administrativeBodyTypes: ['council'] }),
        getSubjectCountForCityCached(cityId),
        cityPromise.then(found => found && isPetitionable(found.status) ? getCityPetitionBucketCached(cityId) : null),
        getTranslations({ locale, namespace: 'meetingStage' }),
        // The whole preference, not just whether one exists: the notification
        // card shows the reader which topics and places they signed up for.
        // Depends on the user id, so it chains off currentUserPromise rather
        // than sitting as a plain sibling.
        currentUserPromise.then(user => user ? getNotificationPreferenceForCity(user.id, cityId) : null),
    ]);

    if (!city) {
        notFound();
    }

    // The rail is a Client Component, so the two clock-dependent facts of a row
    // — the stage and the chip's relative time — are read here, against one
    // instant. Read at render they would be read a second time at hydration,
    // and a meeting crossing a boundary between the two passes would mismatch.
    const now = new Date();
    const dated = (meeting: CouncilMeetingWithSubjectPreview | undefined): DatedMeeting | null => {
        if (!meeting) return null;
        const stage = publicMeetingStage(stageSignalsFromPreview(meeting), now);
        return { meeting, stage, detail: stageChipDetail(tStage, stage, meeting.dateTime, city.timezone, locale, now) };
    };

    // A meeting that has started is no longer the next one, whatever the cache
    // says: the four lists are separately revalidated entries with a 15-minute
    // window, so one that began since the upcoming entry was written would head
    // the rail as "next" wearing a live chip — and appear again as the latest
    // one held once the past entry catches up.
    const bookends = (
        next: CouncilMeetingWithSubjectPreview | undefined,
        latest: CouncilMeetingWithSubjectPreview | undefined,
    ): MeetingBookends => {
        const scheduled = dated(next);
        return { next: scheduled?.stage === 'upcoming' ? scheduled : null, latest: dated(latest) };
    };

    // Whether the city is eligible for the city creator. Read off the counts the
    // city query already carries: this used to load every party and every person
    // — each role dragging a full City row behind it — to compare two lengths
    // against zero. Neither query filters by anything but cityId, so the counts
    // answer the same question.
    const hasNoData = city._count.councilMeetings === 0 && city._count.parties === 0 && city._count.persons === 0;

    const isSuperAdmin = !!currentUser?.isSuperAdmin;
    // An inactive message is a draft: only superadmins see it, to preview it.
    const showMessage = !!cityMessage && (cityMessage.isActive || isSuperAdmin);

    return (
        <div className="relative md:container md:mx-auto py-8 px-4 md:px-8 z-0">
            {/* The rail is placed explicitly into the second column across both
                rows. Its own column means the tabs below start immediately
                rather than after the tallest thing in a band above them.
                On a phone there is one column, and the rail breaks itself up
                (see CityRail) so the order reads identity → Νότης → tabs →
                content → the rest of the rail. The `order` values below are
                what the phone follows; at lg they all fall away and the grid
                placement takes over. */}
            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:gap-10">
                <CityIdentityBand
                    city={city}
                    cityMessage={cityMessage}
                    showMessage={showMessage}
                    subjectCount={subjectCount}
                    locale={locale}
                />

                {/* self-stretch is what gives the rail inside room to stick: the grid
                    is items-start, so without it this wrapper would be exactly as tall
                    as its contents and there would be nothing to travel through.
                    `contents` on a phone hands the rail's own parts to the grid. */}
                <div className="max-lg:contents lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-stretch">
                    <CityRail
                        city={city}
                        cityMessage={cityMessage}
                        canEdit={canEdit}
                        isSuperAdmin={isSuperAdmin}
                        hasNoData={hasNoData}
                        notificationPreference={notificationPreference}
                        petitionBucket={petitionBucket}
                        allMeetings={bookends(upcoming[0], past[0])}
                        councilMeetings={bookends(councilUpcoming[0], councilPast[0])}
                        locale={locale}
                    />
                </div>

                <div className="min-w-0 space-y-8 max-lg:order-3 lg:col-start-1 lg:row-start-2">
                    <CityNavigation cityId={cityId} city={city} />

                    <Suspense fallback={
                        <div className="flex justify-center items-center h-32">
                            <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                    }>
                        <div className="space-y-4 md:space-y-6">
                            {children}
                        </div>
                    </Suspense>
                </div>
            </div>
        </div>
    );
}
