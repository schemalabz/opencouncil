import { notFound } from "next/navigation";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityPeople from "@/components/cities/CityPeople";
import { getPartiesForCityCached, getPeopleForCityCached, getAdministrativeBodiesForCityCached, getCityCached } from "@/lib/cache";
import { Metadata } from "next";
import { buildHreflangAlternates } from '@/lib/utils/hreflang';

export async function generateMetadata(props: { params: Promise<{ cityId: string; locale: string }> }): Promise<Metadata> {
    const params = await props.params;
    const [city, people, parties] = await Promise.all([
        getCityCached(params.cityId),
        getPeopleForCityCached(params.cityId),
        getPartiesForCityCached(params.cityId)
    ]);

    if (!city) {
        return {
            title: "Δημοτικοί Σύμβουλοι δεν βρέθηκαν | OpenCouncil",
            description: "Η λίστα δημοτικών συμβούλων δεν είναι διαθέσιμη.",
        };
    }

    const peopleCount = people?.length || 0;
    const partiesCount = parties?.length || 0;

    // Generate rich description
    const description = `Λίστα όλων των δημοτικών συμβούλων και αντιδημάρχων | ${city.name}. ${peopleCount} συμβούλους από ${partiesCount} κόμματα και παρατάξεις, τα προφίλ τους και τη δραστηριότητά τους στο δημοτικό συμβούλιο.`;

    // Generate OG image URL
    const ogImageUrl = `/api/og?cityId=${params.cityId}&pageType=people`;

    return {
        title: `Δημοτικοί Σύμβουλοι | ${city.name} | OpenCouncil`,
        description,
        keywords: [
            'δημοτικοί σύμβουλοι',
            'δημοτικό συμβούλιο',
            'τοπική αυτοδιοίκηση',
            'αντιδημαρχοι',
            'κόμματα',
            'παρατάξεις',
            city.name,
            'OpenCouncil',
            'λίστα συμβούλων',
            'πολιτικές παρατάξεις'
        ],
        authors: [{ name: `Δήμος ${city.name}` }],
        openGraph: {
            title: `Δημοτικοί Σύμβουλοι | ${city.name}`,
            description,
            type: 'website',
            siteName: 'OpenCouncil',
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: `Δημοτικοί σύμβουλοι του Δήμου ${city.name}`,
                }
            ],
            locale: 'el_GR',
        },
        twitter: {
            card: 'summary_large_image',
            title: `Δημοτικοί Σύμβουλοι | ${city.name}`,
            description,
            images: [ogImageUrl],
        },
        alternates: await buildHreflangAlternates(`/${params.cityId}/people`, params.locale),
        other: {
            'people:count': peopleCount.toString(),
            'people:parties': partiesCount.toString(),
            'people:city': city.name,
        }
    };
}

export default async function PeoplePage(
    props: {
        params: Promise<{ cityId: string }>
    }
) {
    const params = await props.params;

    const {
        cityId
    } = params;

    const [partiesWithPersons, administrativeBodies, allPeople, city, canEdit] = await Promise.all([
        getPartiesForCityCached(cityId),
        getAdministrativeBodiesForCityCached(cityId),
        getPeopleForCityCached(cityId),
        getCityCached(cityId),
        isUserAuthorizedToEdit({ cityId })
    ]);

    if (!partiesWithPersons) {
        notFound();
    }

    return (
        <CityPeople
            allPeople={allPeople}
            partiesWithPersons={partiesWithPersons}
            administrativeBodies={administrativeBodies}
            cityId={cityId}
            canEdit={canEdit}
            city={city}
        />
    );
} 