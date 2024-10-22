"use server";
import { getCity } from "@/lib/db/cities";
import { getPerson } from "@/lib/db/people";
import PersonC from "@/components/persons/Person";
import { getPartiesForCity } from "@/lib/db/parties";
import { notFound } from "next/navigation";
import { isEditMode } from "@/lib/auth";

export default async function PersonPage({ params }: { params: Promise<{ personId: string, cityId: string }> }) {
    const { personId, cityId } = await params;
    const person = await getPerson(personId);
    const city = await getCity(cityId);
    const parties = await getPartiesForCity(cityId);

    if (!person || !city) {
        notFound();
    }

    return <PersonC person={person} city={city} editable={isEditMode()} parties={parties} />
}