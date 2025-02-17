"use server";
import { getPerson } from "@/lib/db/people";
import { getPartiesForCity } from "@/lib/db/parties";
import { getAdministrativeBodiesForCity } from "@/lib/db/administrativeBodies";
import { notFound } from "next/navigation";
import Person from "@/components/persons/Person";
import { getCity } from "@/lib/db/cities";
import { getStatisticsFor } from "@/lib/statistics";

export default async function PersonPage({ params }: { params: { locale: string, personId: string, cityId: string } }) {
    const [person, city, parties, administrativeBodies, statistics] = await Promise.all([
        getPerson(params.personId),
        getCity(params.cityId),
        getPartiesForCity(params.cityId),
        getAdministrativeBodiesForCity(params.cityId),
        getStatisticsFor({ personId: params.personId, cityId: params.cityId }, ['topic', 'person', 'party'])
    ]);

    if (!person || !city) {
        notFound();
    }

    return <Person
        city={city}
        person={person}
        parties={parties}
        administrativeBodies={administrativeBodies}
        statistics={statistics}
    />;
}