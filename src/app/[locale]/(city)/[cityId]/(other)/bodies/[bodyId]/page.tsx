import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import BodyPage from "@/components/bodies/BodyPage";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import { getCityCached, getCouncilMeetingsPreviewCached } from "@/lib/cache";
import { getAdministrativeBodiesForCity, getAdministrativeBodyContacts, getBodyPageRow } from "@/lib/db/administrativeBodies";
import { getPartiesForCity } from "@/lib/db/parties";
import { getPeopleOfBody } from "@/lib/db/people";
import { getLocalizedName } from "@/lib/formatters/name";
import { buildCanonicalAlternates } from "@/lib/utils/hreflang";

type Params = { params: Promise<{ locale: string; cityId: string; bodyId: string }> };

/** How many of the body's meetings the page loads; the list pages through them. */
const MEETINGS_LIMIT = 120;

export async function generateMetadata(props: Params): Promise<Metadata> {
    const { locale, cityId, bodyId } = await props.params;
    const [body, city] = await Promise.all([getBodyPageRow(cityId, bodyId), getCityCached(cityId)]);
    if (!body || !city) {
        return { title: "OpenCouncil" };
    }
    const t = await getTranslations({ locale, namespace: 'body' });
    const name = getLocalizedName(body, locale);
    const cityName = getLocalizedName(city, locale);
    return {
        title: `${name} | ${cityName} | OpenCouncil`,
        description: t('metaDescription', { body: name, city: cityName }),
        alternates: await buildCanonicalAlternates(`/${cityId}/bodies/${bodyId}`),
    };
}

/**
 * The page of one administrative body (#829): its meetings and its members
 * for everyone, and for its admins the forms that run it. A body admin lands
 * here from their profile.
 */
export default async function AdministrativeBodyPage(props: Params) {
    const { cityId, bodyId } = await props.params;
    const [body, city, canEdit, canEditCity] = await Promise.all([
        getBodyPageRow(cityId, bodyId),
        getCityCached(cityId),
        isUserAuthorizedToEdit({ cityId, administrativeBodyId: bodyId }),
        isUserAuthorizedToEdit({ cityId }),
    ]);
    if (!body || !city) {
        notFound();
    }

    // The cached list reads the viewer's unreleased scope itself: an admin of
    // the body sees its drafts, a reader sees the public rows.
    const [meetings, people, bodies, parties, contacts] = await Promise.all([
        getCouncilMeetingsPreviewCached(cityId, { administrativeBodyIds: [bodyId], limit: MEETINGS_LIMIT }),
        getPeopleOfBody(cityId, bodyId),
        canEdit ? getAdministrativeBodiesForCity(cityId) : [],
        // The member form offers a party only to an admin of the city: a body
        // admin gives roles on their body and nothing else (#828).
        canEditCity ? getPartiesForCity(cityId) : [],
        canEdit ? getAdministrativeBodyContacts(cityId, bodyId) : null,
    ]);

    return (
        <BodyPage
            city={{ id: city.id, name: city.name, name_en: city.name_en, timezone: city.timezone }}
            body={body}
            meetings={meetings}
            people={people}
            formBodies={bodies.filter(candidate => candidate.id === bodyId)}
            parties={parties}
            contacts={contacts}
            canEdit={canEdit}
            canEditCity={canEditCity}
            now={new Date()}
            cappedAt={MEETINGS_LIMIT}
        />
    );
}
