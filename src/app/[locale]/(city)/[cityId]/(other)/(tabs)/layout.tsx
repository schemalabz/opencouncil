import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { CityIdentityBand } from "@/components/cities/CityIdentityBand";
import { CityNavigation } from "@/components/cities/CityNavigation";
import { getCityCached, getCityMessageCached, getCouncilMeetingsForCityPublicCached, getPartiesForCityCached, getPeopleForCityCached } from "@/lib/cache";
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
    const [city, cityMessage, parties, people, currentUser, canEdit, upcoming, past] = await Promise.all([
        getCityCached(cityId),
        getCityMessageCached(cityId),
        getPartiesForCityCached(cityId),
        getPeopleForCityCached(cityId),
        getCurrentUser(),
        isUserAuthorizedToEdit({ cityId }),
        getCouncilMeetingsForCityPublicCached(cityId, { timeFilter: 'upcoming', limit: 1 }),
        getCouncilMeetingsForCityPublicCached(cityId, { timeFilter: 'past', limit: 1 }),
    ]);

    if (!city) {
        notFound();
    }

    // Check if city has no data (eligible for city creator)
    const hasNoData = city._count.councilMeetings === 0 && parties.length === 0 && people.length === 0;

    const hasNotifications = currentUser
        ? !!(await getNotificationPreferenceForCity(currentUser.id, cityId))
        : false;

    const isSuperAdmin = !!currentUser?.isSuperAdmin;
    // An inactive message is a draft: only superadmins see it, to preview it.
    const showMessage = !!cityMessage && (cityMessage.isActive || isSuperAdmin);

    return (
        <div className="relative md:container md:mx-auto py-8 px-4 md:px-8 space-y-8 z-0">
            <div className="space-y-8">
                <CityIdentityBand
                    city={city}
                    cityMessage={cityMessage}
                    showMessage={showMessage}
                    canEdit={canEdit}
                    isSuperAdmin={isSuperAdmin}
                    hasNoData={hasNoData}
                    hasNotifications={hasNotifications}
                    nextMeeting={upcoming[0] ?? null}
                    latestMeeting={past[0] ?? null}
                    locale={locale}
                />

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
    );
}
