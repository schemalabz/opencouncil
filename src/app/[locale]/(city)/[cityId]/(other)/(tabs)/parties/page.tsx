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
    const [people, partiesWithPersons, canEdit] = await Promise.all([
        getPeopleForCityCached(cityId),
        getPartiesForCityCached(cityId),
        isUserAuthorizedToEdit({ cityId }),
    ]);

    if (!partiesWithPersons) {
        notFound();
    }

    const peopleWithoutParties = people.filter(person => !partiesWithPersons.some(party => party.people.some(p => p.id === person.id)));

    return (
        <CityParties
            partiesWithPersons={partiesWithPersons}
            peopleWithoutParties={peopleWithoutParties}
            cityId={cityId}
            canEdit={canEdit}
        />
    );
}
