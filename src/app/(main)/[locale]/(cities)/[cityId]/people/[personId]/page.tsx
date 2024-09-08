"use server"
import { getCity } from "@/lib/db/cities";
import { getPerson } from "@/lib/db/people";
import PersonC from "@/components/persons/Person";
import { getPartiesForCity } from "@/lib/db/parties";
import { notFound } from "next/navigation";
import { isEditMode } from "@/lib/utils";

export default async function PersonPage({ params }: { params: { personId: string, cityId: string } }) {
    const person = await getPerson(params.personId);
    const city = await getCity(params.cityId);
    const parties = await getPartiesForCity(params.cityId);

    if (!person || !city) {
        notFound();
    }

    return <PersonC person={person} city={city} editable={isEditMode()} parties={parties} />
}