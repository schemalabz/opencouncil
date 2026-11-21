import { notFound } from "next/navigation";
import { Metadata } from "next";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityParties from "@/components/cities/CityParties";
import { getPartiesForCityCached, getCityCached } from "@/lib/cache";
import { listPeopleOfCityCached } from "@/lib/cache";
import { withCanonicalUrl } from "@/lib/utils/hreflang";
import { getLocalizedName, getMunicipalityQualifier } from "@/lib/formatters/name";
import { authorityKey } from "@/lib/utils/authority";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(props: { params: Promise<{ cityId: string; locale: string }> }): Promise<Metadata> {
    const params = await props.params;
    const city = await getCityCached(params.cityId);

    if (!city) {
        notFound();
    }

    const cityName = getLocalizedName(city, params.locale);
    const t = await getTranslations({ locale: params.locale, namespace: "metadata.parties" });
    return withCanonicalUrl(`/${params.cityId}/parties`, {
        title: t("title", { cityName }),
        description: t(authorityKey('description', city), { cityName, qualifier: getMunicipalityQualifier(city, params.locale) }),
    });
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

    const [city, people, partiesWithPersons, canEdit] = await Promise.all([
        getCityCached(cityId),
        listPeopleOfCityCached(cityId),
        getPartiesForCityCached(cityId),
        isUserAuthorizedToEdit({ cityId }),
    ]);

    if (!city || !partiesWithPersons) {
        notFound();
    }

    const peopleWithoutParties = people.filter(person => !partiesWithPersons.some(party => party.people.some(p => p.id === person.id)));

    return (
        <CityParties
            partiesWithPersons={partiesWithPersons}
            peopleWithoutParties={peopleWithoutParties}
            cityId={cityId}
            authorityType={city.authorityType}
            canEdit={canEdit}
        />
    );
} 