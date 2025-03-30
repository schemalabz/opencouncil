import { notFound } from "next/navigation";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityPeople from "@/components/cities/CityPeople";
import { getPartiesForCity } from "@/lib/db/parties";

export default async function PeoplePage({
    params: { cityId }
}: {
    params: { cityId: string }
}) {
    const partiesWithPersons = await getPartiesForCity(cityId);

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