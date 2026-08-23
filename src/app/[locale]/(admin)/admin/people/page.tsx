import { getCities } from "@/lib/db/cities";
import { getPeopleWithVoicePrintsForCity, PersonWithVoicePrints } from "@/lib/db/people";
import { getAdministrativeBodiesForCity } from "@/lib/db/administrativeBodies";
import { sortPersonsByLastName } from "@/lib/sorting/people";
import CitySelector from "@/components/admin/people/city-selector";
import People from "@/components/admin/people/people";
import { AdministrativeBody } from "@prisma/client";
import { withUserAuthorizedToEdit } from "@/lib/auth";

interface PageProps {
    searchParams: Promise<{ cityId?: string }>;
}

export default async function PeoplePage(props: PageProps) {
    // This page had no server guard of its own. The (admin) layout guard does
    // not re-run on RSC navigation, so re-assert the superadmin gate here.
    await withUserAuthorizedToEdit({});
    const searchParams = await props.searchParams;
    const cities = await getCities({ includeNonPublic: true });

    const selectedCityId = searchParams.cityId || (cities.length > 0 ? cities[0].id : "");

    let people: PersonWithVoicePrints[] = [];
    let administrativeBodies: AdministrativeBody[] = [];
    if (selectedCityId) {
        const [peopleData, bodies] = await Promise.all([
            getPeopleWithVoicePrintsForCity(selectedCityId),
            getAdministrativeBodiesForCity(selectedCityId),
        ]);
        people = sortPersonsByLastName(peopleData);
        administrativeBodies = bodies;
    }

    const currentCityName = cities.find(c => c.id === selectedCityId)?.name || "Select City";

    return (
        <div className='container mx-auto py-8'>
            <div className='flex justify-between items-center mb-6'>
                <h1 className='text-3xl font-bold'>People Management</h1>
            </div>

            <div className='flex flex-col md:flex-row gap-4 mb-6'>
                <div className='w-full md:w-1/3'>
                    <CitySelector cities={cities} selectedCityId={selectedCityId} />
                </div>
            </div>

            <People
                people={people}
                currentCityName={currentCityName}
                administrativeBodies={administrativeBodies}
            />
        </div>
    );
}
