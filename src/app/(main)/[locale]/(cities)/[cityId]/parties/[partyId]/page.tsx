"use server";
import PartyC from "@/components/parties/Party";
import { getCity } from "@/lib/db/cities";
import { getParty } from "@/lib/db/parties";
import { isEditMode } from "@/lib/utils";
import { notFound } from "next/navigation";


export default async function PersonPage({ params }: { params: { partyId: string, cityId: string } }) {
    const party = await getParty(params.partyId);
    const city = await getCity(params.cityId);

    if (!party || !city) {
        notFound();
    }

    return <PartyC party={party} city={city} editable={isEditMode()} />
}