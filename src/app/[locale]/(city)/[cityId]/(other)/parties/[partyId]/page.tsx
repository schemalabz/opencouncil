"use server";
import PartyC from "@/components/parties/Party";
import { getCity } from "@/lib/db/cities";
import { getParty } from "@/lib/db/parties";
import { notFound } from "next/navigation";
import { getAdministrativeBodiesForCity } from "@/lib/db/administrativeBodies";
import { isUserAuthorizedToEdit } from "@/lib/auth";

export default async function PartyPage({ params }: { params: { locale: string, partyId: string, cityId: string } }) {
    const includeUnreleased = await isUserAuthorizedToEdit({ cityId: params.cityId });

    const [party, city, administrativeBodies] = await Promise.all([
        getParty(params.partyId),
        getCity(params.cityId),
        getAdministrativeBodiesForCity(params.cityId)
    ]);

    if (!party || !city) {
        notFound();
    }

    return <PartyC party={party} city={city} administrativeBodies={administrativeBodies} includeUnreleased={includeUnreleased} />
}
