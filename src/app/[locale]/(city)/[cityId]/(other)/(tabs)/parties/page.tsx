import { notFound } from "next/navigation";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityParties from "@/components/cities/CityParties";
import { getPartiesForCityCached } from "@/lib/cache";
import { getPeopleForCityCached } from "@/lib/cache";
export default async function PartiesPage({
    params: { cityId }
}: {
    params: { cityId: string }
}) {
    const people = await getPeopleForCityCached(cityId);
    const partiesWithPersons = await getPartiesForCityCached(cityId);

    const peopleWithoutParties = people.filter(person => !partiesWithPersons.some(party => party.people.some(p => p.id === person.id)));

    if (!partiesWithPersons) {
        notFound();
    }

    const canEdit = await isUserAuthorizedToEdit({ cityId });

    return (
        <CityParties
            partiesWithPersons={partiesWithPersons}
            peopleWithoutParties={peopleWithoutParties}
            cityId={cityId}
            canEdit={canEdit}
        />
    );
} 