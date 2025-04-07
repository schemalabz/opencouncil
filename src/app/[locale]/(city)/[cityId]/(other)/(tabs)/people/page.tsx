import { notFound } from "next/navigation";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityPeople from "@/components/cities/CityPeople";
import { getPartiesForCityCached } from "@/lib/cachedData";
import { getAdministrativeBodiesForCity } from "@/lib/db/administrativeBodies";
import { getPeopleForCity } from "@/lib/db/people";

export default async function PeoplePage({
    params: { cityId }
}: {
    params: { cityId: string }
}) {
    const [partiesWithPersons, administrativeBodies, allPeople] = await Promise.all([
        getPartiesForCityCached(cityId),
        getAdministrativeBodiesForCity(cityId),
        getPeopleForCity(cityId)
    ]);

    if (!partiesWithPersons) {
        notFound();
    }

    const canEdit = await isUserAuthorizedToEdit({ cityId });

    return (
        <CityPeople
            allPeople={allPeople}
            partiesWithPersons={partiesWithPersons}
            administrativeBodies={administrativeBodies}
            cityId={cityId}
            canEdit={canEdit}
        />
    );
} 