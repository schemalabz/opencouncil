import { getCities } from "@/lib/db/cities";
import { getPeopleForCity, PersonWithRelations } from "@/lib/db/people";
import { getAdministrativeBodiesForCity } from "@/lib/db/administrativeBodies";
import { sortPersonsByLastName } from "@/lib/sorting/people";
import CitySelector from "@/components/admin/people/city-selector";
import People from "@/components/admin/people/people";
import { AdministrativeBody } from "@prisma/client";

interface PageProps {
    searchParams: { cityId?: string };
}

export default async function PeoplePage({ searchParams }: PageProps) {
    const cities = await getCities({ includeUnlisted: true });

    const selectedCityId = searchParams.cityId || (cities.length > 0 ? cities[0].id : "");

    let people: PersonWithRelations[] = [];
    let administrativeBodies: AdministrativeBody[] = [];
    if (selectedCityId) {
        const [peopleData, bodies] = await Promise.all([
            getPeopleForCity(selectedCityId),
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
