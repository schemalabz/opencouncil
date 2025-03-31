import { notFound } from "next/navigation";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityPeople from "@/components/cities/CityPeople";
import { getPartiesForCityCached } from "@/lib/cachedData";

export default async function PeoplePage({
    params: { cityId }
}: {
    params: { cityId: string }
}) {
    const partiesWithPersons = await getPartiesForCityCached(cityId);

    if (!partiesWithPersons || partiesWithPersons.length === 0) {
        notFound();
    }

    const canEdit = await isUserAuthorizedToEdit({ cityId });

    return (
        <CityPeople 
            partiesWithPersons={partiesWithPersons}
            cityId={cityId}
            canEdit={canEdit}
        />
    );
} 