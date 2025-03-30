import { notFound } from "next/navigation";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityParties from "@/components/cities/CityParties";
import { getPartiesForCity } from "@/lib/db/parties";

export default async function PartiesPage({
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
        <CityParties 
            partiesWithPersons={partiesWithPersons}
            cityId={cityId}
            canEdit={canEdit}
        />
    );
} 