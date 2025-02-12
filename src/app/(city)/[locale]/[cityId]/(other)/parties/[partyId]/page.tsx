"use server";
import PartyC from "@/components/parties/Party";
import { getCity } from "@/lib/db/cities";
import { getParty } from "@/lib/db/parties";
import { notFound } from "next/navigation";
import { unstable_setRequestLocale } from "next-intl/server";

export default async function PartyPage({ params }: { params: { locale: string, partyId: string, cityId: string } }) {
    unstable_setRequestLocale(params.locale);

    const party = await getParty(params.partyId);
    const city = await getCity(params.cityId);

    if (!party || !city) {
        notFound();
    }

    return <PartyC party={party} city={city} />
}
