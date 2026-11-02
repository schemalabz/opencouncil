import { getCities } from "@/lib/db/cities";
import { getCouncilMeetingsForCity, type CouncilMeetingWithAdminBodyAndSubjects } from "@/lib/db/meetingsList";
import { getDecisionCountsForCity, MeetingDecisionCounts } from "@/lib/db/decisions";
import { getAdminRealms } from "@/lib/auth";
import { realmBaseUrl } from "@/lib/utils/realmBaseUrl";
import { notFound } from "next/navigation";
import CitySelector from "@/components/admin/people/city-selector";
import Meetings from "@/components/admin/meetings/Meetings";

interface PageProps {
    searchParams: Promise<{ cityId?: string }>;
}

export default async function AdminMeetingsPage(props: PageProps) {
    const searchParams = await props.searchParams;
    const realms = await getAdminRealms();

    const cities = await getCities({ includeNonPublic: true }, realms);
    // A city outside the viewer's realms is not theirs to see.
    if (searchParams.cityId && !cities.some(c => c.id === searchParams.cityId)) notFound();
    const selectedCityId = searchParams.cityId || (cities.length > 0 ? cities[0].id : "");
    const selectedCity = cities.find(c => c.id === selectedCityId);

    let meetings: CouncilMeetingWithAdminBodyAndSubjects[] = [];
    let decisionCounts: MeetingDecisionCounts = {};
    let cityHasDiavgeiaUid = false;
    if (selectedCityId) {
        [meetings, decisionCounts] = await Promise.all([
            getCouncilMeetingsForCity(selectedCityId, { includeUnreleased: true }),
            getDecisionCountsForCity(selectedCityId),
        ]);
        cityHasDiavgeiaUid = !!selectedCity?.diavgeiaUid;
    }

    const currentCityName = selectedCity?.name || "Select City";
    // The meeting pages live on the realm domain of the city, not on the admin host.
    const citySiteUrl = realmBaseUrl(selectedCity?.realm);

    return (
        <div className='container mx-auto py-8'>
            <div className='flex justify-between items-center mb-6'>
                <h1 className='text-3xl font-bold'>Meetings Management</h1>
            </div>

            <div className='flex flex-col md:flex-row gap-4 mb-6'>
                <div className='w-full md:w-1/3'>
                    <CitySelector cities={cities} selectedCityId={selectedCityId} />
                </div>
            </div>

            <Meetings
                meetings={meetings}
                currentCityName={currentCityName}
                selectedCityId={selectedCityId}
                citySiteUrl={citySiteUrl}
                decisionCounts={decisionCounts}
                cityHasDiavgeiaUid={cityHasDiavgeiaUid}
            />
        </div>
    );
} 