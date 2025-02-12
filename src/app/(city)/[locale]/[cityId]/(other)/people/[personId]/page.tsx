"use server";
import { getPerson } from "@/lib/db/people";
import { getPartiesForCity } from "@/lib/db/parties";
import { notFound } from "next/navigation";
import Person from "@/components/persons/Person";
import { getCity } from "@/lib/db/cities";
import { unstable_setRequestLocale } from "next-intl/server";
export default async function PersonPage({ params }: { params: { locale: string, personId: string, cityId: string } }) {
    unstable_setRequestLocale(params.locale);

    const person = await getPerson(params.personId);
    const city = await getCity(params.cityId);
    const parties = await getPartiesForCity(params.cityId);

    if (!person || !city) {
        notFound();
    }

    return <Person city={city} person={person} parties={parties} />;
}