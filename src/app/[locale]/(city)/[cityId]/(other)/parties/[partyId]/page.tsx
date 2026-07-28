"use server";
import { cache } from "react";
import PartyC from "@/components/parties/Party";
import { getCityCached } from "@/lib/cache";
import { getParty } from "@/lib/db/parties";
import { notFound } from "next/navigation";
import { getAdministrativeBodiesForCity } from "@/lib/db/administrativeBodies";
import { Metadata } from "next";
import { buildCanonicalAlternates } from "@/lib/utils/hreflang";
import { getLocalizedName, getLocalizedShortName } from "@/lib/formatters/name";

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

    const partyName = getLocalizedName(party, params.locale);
    const cityName = getLocalizedName(city, params.locale);
    const description = `Η παράταξη ${partyName} στο Δημοτικό Συμβούλιο του Δήμου ${cityName}. Δείτε τα μέλη, τις τοποθετήσεις και τη δραστηριότητά της στις συνεδριάσεις.`;
    const ogImageUrl = `/api/og?cityId=${params.cityId}`;

    return {
        title: `${partyName} | ${cityName} | OpenCouncil`,
        description,
        keywords: [
            partyName,
            getLocalizedShortName(party, params.locale),
            "παράταξη",
            "δημοτικό συμβούλιο",
            "τοπική αυτοδιοίκηση",
            cityName,
            "OpenCouncil",
        ],
        authors: [{ name: `Δήμος ${cityName}` }],
        openGraph: {
            title: `${partyName} | ${cityName}`,
            description,
            type: "website",
            siteName: "OpenCouncil",
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: `${partyName} — Δήμος ${cityName}`,
                },
            ],
            locale: params.locale === "en" ? "en_US" : "el_GR",
        },
        twitter: {
            card: "summary_large_image",
            title: `${partyName} | ${cityName}`,
            description,
            images: [ogImageUrl],
        },
        alternates: await buildCanonicalAlternates(
            `/${params.cityId}/parties/${params.partyId}`,
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
