"use server";
import { getPerson } from "@/lib/db/people";
import { getPartiesForCity } from "@/lib/db/parties";
import { getAdministrativeBodiesForCity } from "@/lib/db/administrativeBodies";
import { notFound } from "next/navigation";
import Person from "@/components/persons/Person";
import { getCity } from "@/lib/db/cities";
import { getStatisticsFor } from "@/lib/statistics";
import { Metadata } from "next";
import { env } from '@/env.mjs';

export async function generateMetadata({ params }: { params: { locale: string, personId: string, cityId: string } }): Promise<Metadata> {
    const [person, city] = await Promise.all([
        getPerson(params.personId),
        getCity(params.cityId)
    ]);

    if (!person || !city) {
        return {
            title: "Το πρόσωπο δεν βρέθηκε | OpenCouncil",
            description: "Το πρόσωπο που ζητάτε δεν βρέθηκε ή δεν είναι διαθέσιμος.",
        };
    }

    // Find current party/role
    const currentRole = person.roles.find(role => {
        const now = new Date();
        return (!role.startDate || role.startDate <= now) &&
            (!role.endDate || role.endDate > now);
    });

    const currentParty = currentRole?.party;
    const roleDescription = currentParty ? ` (${currentParty.name})` : '';

    // Generate rich description
    const description = `Προφίλ του προσώπου ${person.name} ${roleDescription} | ${city.name} | Στατιστικά συμμετοχής, τοποθετήσεις, δραστηριότητα στο δημοτικό συμβούλιο.`;

    // Generate OG image URL
    const ogImageUrl = `${env.NEXT_PUBLIC_BASE_URL}/api/og?cityId=${params.cityId}&personId=${params.personId}`;

    return {
        title: `${person.name} | ${city.name} | OpenCouncil`,
        description,
        keywords: [
            'δημοτικός σύμβουλος',
            'δημοτικό συμβούλιο',
            'τοπική αυτοδιοίκηση',
            person.name,
            city.name,
            'OpenCouncil',
            ...(currentParty ? [currentParty.name, 'πολιτικό κόμμα'] : []),
            'στατιστικά συμμετοχής',
            'τοποθετήσεις'
        ],
        authors: [{ name: person.name }],
        openGraph: {
            title: `${person.name} | ${city.name}`,
            description,
            type: 'profile',
            siteName: 'OpenCouncil',
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: `${person.name} (${city.name})`,
                }
            ],
            locale: 'el_GR',
        },
        twitter: {
            card: 'summary_large_image',
            title: `${person.name} | ${city.name}`,
            description,
            images: [ogImageUrl],
        },
        alternates: {
            canonical: `/${params.cityId}/people/${params.personId}`,
        },
        other: {
            'person:name': person.name,
            'person:city': city.name,
            'person:party': currentParty?.name || '',
            'person:hasImage': person.image ? 'true' : 'false',
        }
    };
}

export default async function PersonPage({ params }: { params: { locale: string, personId: string, cityId: string } }) {
    const [person, city, parties, administrativeBodies, statistics] = await Promise.all([
        getPerson(params.personId),
        getCity(params.cityId),
        getPartiesForCity(params.cityId),
        getAdministrativeBodiesForCity(params.cityId),
        getStatisticsFor({ personId: params.personId, cityId: params.cityId }, ['topic'])
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