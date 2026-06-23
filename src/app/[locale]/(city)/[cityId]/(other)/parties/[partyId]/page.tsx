"use server";
import { cache } from "react";
import PartyC from "@/components/parties/Party";
import { getCityCached } from "@/lib/cache";
import { getParty } from "@/lib/db/parties";
import { notFound } from "next/navigation";
import { getAdministrativeBodiesForCity } from "@/lib/db/administrativeBodies";
import { Metadata } from "next";
import { buildHreflangAlternates } from "@/lib/utils/hreflang";

// Request-scoped dedup so generateMetadata and PartyPage share a single fetch.
const getPartyCached = cache(getParty);

export async function generateMetadata(
    props: {
        params: Promise<{ locale: string; partyId: string; cityId: string }>;
    }
): Promise<Metadata> {
    const params = await props.params;
    const [party, city] = await Promise.all([
        getPartyCached(params.partyId),
        getCityCached(params.cityId),
    ]);

    if (!party || !city) {
        return {
            title: "Παράταξη δεν βρέθηκε | OpenCouncil",
            description: "Η παράταξη που αναζητάτε δεν είναι διαθέσιμη.",
        };
    }

    const description = `Η παράταξη ${party.name} στο Δημοτικό Συμβούλιο του Δήμου ${city.name}. Δείτε τα μέλη, τις τοποθετήσεις και τη δραστηριότητά της στις συνεδριάσεις.`;
    const ogImageUrl = `/api/og?cityId=${params.cityId}`;

    return {
        title: `${party.name} | ${city.name} | OpenCouncil`,
        description,
        keywords: [
            party.name,
            party.name_short,
            "παράταξη",
            "δημοτικό συμβούλιο",
            "τοπική αυτοδιοίκηση",
            city.name,
            "OpenCouncil",
        ],
        authors: [{ name: `Δήμος ${city.name}` }],
        openGraph: {
            title: `${party.name} | ${city.name}`,
            description,
            type: "website",
            siteName: "OpenCouncil",
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: `${party.name} — Δήμος ${city.name}`,
                },
            ],
            locale: params.locale === "en" ? "en_US" : "el_GR",
        },
        twitter: {
            card: "summary_large_image",
            title: `${party.name} | ${city.name}`,
            description,
            images: [ogImageUrl],
        },
        alternates: await buildHreflangAlternates(
            `/${params.cityId}/parties/${params.partyId}`,
            params.locale,
        ),
        other: {
            "party:name": party.name,
            "party:short": party.name_short,
            "party:city": city.name,
        },
    };
}

export default async function PartyPage(
    props: { params: Promise<{ locale: string, partyId: string, cityId: string }> }
) {
    const params = await props.params;

    const [party, city, administrativeBodies] = await Promise.all([
        getPartyCached(params.partyId),
        getCityCached(params.cityId),
        getAdministrativeBodiesForCity(params.cityId)
    ]);

    if (!party || !city) {
        notFound();
    }

    return <PartyC party={party} city={city} administrativeBodies={administrativeBodies} />
}
