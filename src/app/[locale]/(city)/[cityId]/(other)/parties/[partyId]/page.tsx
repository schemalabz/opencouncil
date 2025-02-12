"use server";
import PartyC from "@/components/parties/Party";
import { getCity } from "@/lib/db/cities";
import { getParty } from "@/lib/db/parties";
import { notFound } from "next/navigation";

export default async function PartyPage({ params }: { params: { locale: string, partyId: string, cityId: string } }) {

    const party = await getParty(params.partyId);
    const city = await getCity(params.cityId);

    if (!party || !city) {
        notFound();
    }

    return <PartyC party={party} city={city} />
}
