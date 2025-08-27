import { getCities } from "@/lib/db/cities";
import { getCouncilMeetingsForCity, CouncilMeetingWithAdminBodyAndSubjects } from "@/lib/db/meetings";
import { withUserAuthorizedToEdit } from "@/lib/auth";
import CitySelector from "@/components/admin/people/city-selector";
import Meetings from "@/components/admin/meetings/Meetings";

interface PageProps {
    searchParams: { cityId?: string };
}

export default async function AdminMeetingsPage({ searchParams }: PageProps) {
    // Ensure user is authorized as super admin
    await withUserAuthorizedToEdit({});

    const cities = await getCities({ includeUnlisted: true });
    const selectedCityId = searchParams.cityId || (cities.length > 0 ? cities[0].id : "");

    let meetings: CouncilMeetingWithAdminBodyAndSubjects[] = [];
    if (selectedCityId) {
        meetings = await getCouncilMeetingsForCity(selectedCityId, { includeUnreleased: true });
    }

    const currentCityName = cities.find(c => c.id === selectedCityId)?.name || "Select City";

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
            />
        </div>
    );
} 