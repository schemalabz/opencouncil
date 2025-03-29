import { notFound } from "next/navigation";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityPeople from "@/components/cities/CityPeople";
import { getFullCity } from "@/lib/db/cities";

export default async function PeoplePage({
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
        <CityPeople 
            persons={city.persons}
            parties={city.parties}
            cityId={cityId}
            canEdit={canEdit}
        />
    );
} 