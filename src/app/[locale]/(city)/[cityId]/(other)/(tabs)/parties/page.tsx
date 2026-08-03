import { notFound } from "next/navigation";
import { Metadata } from "next";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityParties from "@/components/cities/CityParties";
import { getPartiesForCityCached, getCityCached } from "@/lib/cache";
import { getPeopleForCityCached } from "@/lib/cache";
import { buildCanonicalAlternates } from "@/lib/utils/hreflang";
import { getLocalizedName } from "@/lib/formatters/name";

export async function generateMetadata(props: { params: Promise<{ cityId: string; locale: string }> }): Promise<Metadata> {
    const params = await props.params;
    const city = await getCityCached(params.cityId);

    if (!city) {
        notFound();
    }

    const cityName = getLocalizedName(city, params.locale);
    return {
        title: `Παρατάξεις | ${cityName} | OpenCouncil`,
        description: `Οι δημοτικές παρατάξεις του δήμου ${cityName}, τα μέλη τους και η δραστηριότητά τους στο δημοτικό συμβούλιο.`,
        alternates: await buildCanonicalAlternates(`/${params.cityId}/parties`),
    };
}

export default async function PartiesPage(
    props: {
        params: Promise<{ cityId: string }>
    }
) {
    const params = await props.params;

    const {
        cityId
    } = params;

    const [people, partiesWithPersons, canEdit] = await Promise.all([
        getPeopleForCityCached(cityId),
        getPartiesForCityCached(cityId),
        isUserAuthorizedToEdit({ cityId }),
    ]);

    if (!partiesWithPersons) {
        notFound();
    }

    const peopleWithoutParties = people.filter(person => !partiesWithPersons.some(party => party.people.some(p => p.id === person.id)));

    return (
        <CityParties
            partiesWithPersons={partiesWithPersons}
            peopleWithoutParties={peopleWithoutParties}
            cityId={cityId}
            canEdit={canEdit}
        />
    );
} 