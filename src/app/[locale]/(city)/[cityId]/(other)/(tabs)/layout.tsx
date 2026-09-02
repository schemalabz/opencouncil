import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { CityIdentityBand } from "@/components/cities/CityIdentityBand";
import { CityRail } from "@/components/cities/CityRail";
import { CityNavigation } from "@/components/cities/CityNavigation";
import { getCityCached, getCityMessageCached, getCityPetitionBucketCached, getCouncilMeetingsPreviewPublicCached, getSubjectCountForCityCached } from "@/lib/cache";
import { isPetitionable } from "@/lib/cityStatus";
import { getCurrentUser, isUserAuthorizedToEdit } from "@/lib/auth";
import { getNotificationPreferenceForCity } from "@/lib/db/notifications";

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
    const [city, cityMessage, currentUser, canEdit, upcoming, past, councilUpcoming, councilPast, subjectCount, petitionBucket] = await Promise.all([
        cityPromise,
        getCityMessageCached(cityId),
        getCurrentUser(),
        isUserAuthorizedToEdit({ cityId }),
        getCouncilMeetingsPreviewPublicCached(cityId, { timeFilter: 'upcoming', limit: 1 }),
        getCouncilMeetingsPreviewPublicCached(cityId, { timeFilter: 'past', limit: 1 }),
        getCouncilMeetingsPreviewPublicCached(cityId, { timeFilter: 'upcoming', limit: 1, administrativeBodyTypes: ['council'] }),
        getCouncilMeetingsPreviewPublicCached(cityId, { timeFilter: 'past', limit: 1, administrativeBodyTypes: ['council'] }),
        getSubjectCountForCityCached(cityId),
        cityPromise.then(found => found && isPetitionable(found.status) ? getCityPetitionBucketCached(cityId) : null),
    ]);

    if (!city) {
        notFound();
    }

    // Whether the city is eligible for the city creator. Read off the counts the
    // city query already carries: this used to load every party and every person
    // — each role dragging a full City row behind it — to compare two lengths
    // against zero. Neither query filters by anything but cityId, so the counts
    // answer the same question.
    const hasNoData = city._count.councilMeetings === 0 && city._count.parties === 0 && city._count.persons === 0;

    // The whole preference, not just whether one exists: the notification card
    // shows the reader which topics and places they signed up for.
    const notificationPreference = currentUser
        ? await getNotificationPreferenceForCity(currentUser.id, cityId)
        : null;

    const isSuperAdmin = !!currentUser?.isSuperAdmin;
    // An inactive message is a draft: only superadmins see it, to preview it.
    const showMessage = !!cityMessage && (cityMessage.isActive || isSuperAdmin);

    return (
        <div className="relative md:container md:mx-auto py-8 px-4 md:px-8 z-0">
            {/* The rail is placed explicitly into the second column across both
                rows, so on a phone the DOM order still reads identity → rail →
                tabs. Its own column means the tabs below start immediately
                rather than after the tallest thing in a band above them. */}
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
                    as its contents and there would be nothing to travel through. */}
                <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-stretch">
                    <CityRail
                        city={city}
                        cityMessage={cityMessage}
                        canEdit={canEdit}
                        isSuperAdmin={isSuperAdmin}
                        hasNoData={hasNoData}
                        notificationPreference={notificationPreference}
                        petitionBucket={petitionBucket}
                        allMeetings={{ next: upcoming[0] ?? null, latest: past[0] ?? null }}
                        councilMeetings={{ next: councilUpcoming[0] ?? null, latest: councilPast[0] ?? null }}
                        locale={locale}
                    />
                </div>

                <div className="min-w-0 space-y-8 lg:col-start-1 lg:row-start-2">
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
