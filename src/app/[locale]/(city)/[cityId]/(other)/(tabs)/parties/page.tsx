import { notFound } from "next/navigation";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityParties from "@/components/cities/CityParties";
import { getPartiesForCityCached } from "@/lib/cachedData";

export default async function PartiesPage({
    params: { cityId }
}: {
    params: { cityId: string }
}) {
    const partiesWithPersons = await getPartiesForCityCached(cityId);

    if (!partiesWithPersons) {
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