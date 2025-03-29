import { notFound } from "next/navigation";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityParties from "@/components/cities/CityParties";
import { getFullCity } from "@/lib/db/cities";

export default async function PartiesPage({
    params: { cityId }
}: {
    params: { cityId: string }
}) {
    const city = await getFullCity(cityId);

    if (!city) {
        notFound();
    }

    const canEdit = await isUserAuthorizedToEdit({ cityId });

    return (
        <CityParties 
            parties={city.parties}
            persons={city.persons}
            cityId={cityId}
            canEdit={canEdit}
        />
    );
} 