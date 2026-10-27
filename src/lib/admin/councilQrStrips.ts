import "server-only";
import { getTranslations } from "next-intl/server";
import { getRoleTitles } from "@/i18n/roleTitles";
import { catalogLocaleForCityLanguage } from "@/i18n/config";
import { getCity } from "@/lib/db/cities";
import { getPeopleForCity, type PersonWithRelations } from "@/lib/db/people";
import { getClaimedPersonIds } from "@/lib/db/personClaim";
import { claimExpiry, claimLastValidDay, personJoinUrl } from "@/lib/auth/personClaim";
import { getCouncilTitle, isMayor } from "@/lib/utils/roles";
import { sortPeople } from "@/lib/sorting/people";
import { formatDate } from "@/lib/formatters/time";

export interface QrStripPerson {
    id: string;
    name: string;
    role: string | null;
    joinUrl: string;
}

/** The strip texts in the city's language; `private` still holds `{name}`. */
export interface QrStripTexts {
    scan: string;
    validUntil: string;
    secretCode: string;
    privateLead: string;
    private: string;
}

export interface CouncilQrStrips {
    cityName: string;
    people: QrStripPerson[];
    texts: QrStripTexts;
}

/**
 * Who gets a strip: an elected member, so the mayor, a council member or a
 * community council member. A deputy mayor is appointed from the council, so
 * the seat covers them; a committee member sits on the council too. Not every
 * city-level role: a General Secretary is city staff, not elected, and must
 * not be able to claim a page. The roles are the active ones already: the
 * query asks for those.
 */
function isElectedMember(person: PersonWithRelations): boolean {
    return isMayor(person) || person.roles.some((r) => r.administrativeBody?.type === "council" || r.administrativeBody?.type === "community");
}

/**
 * The people of a city who can get a strip now, in print order: elected,
 * and not claimed yet. By body, so each community's strips print together
 * after the council's. Null for an unknown city.
 */
async function eligibleMembers(cityId: string) {
    const [city, people, claimed] = await Promise.all([
        getCity(cityId),
        getPeopleForCity(cityId, true),
        getClaimedPersonIds(cityId),
    ]);
    if (!city) return null;
    return { city, members: sortPeople(people.filter((p) => isElectedMember(p) && !claimed.has(p.id))) };
}

/**
 * The ids of the people {@link getCouncilQrStrips} would print a strip for.
 * The admin people page counts and selects against it; the strips route still
 * applies the rule itself, so a stale page cannot widen it.
 */
export async function getQrEligiblePersonIds(cityId: string): Promise<string[]> {
    const eligible = await eligibleMembers(cityId);
    return eligible ? eligible.members.map((p) => p.id) : [];
}

/**
 * What the strips PDF of a city needs, with claim tokens minted now: every
 * call gives new codes, each valid for the claim lifetime from this moment.
 * Codes from an earlier call stay valid until they expire. Null for an
 * unknown city.
 *
 * The elected members of {@link isElectedMember}, in the order of the people
 * page. A person whose page is already claimed gets no strip: their code would
 * be refused. A delegate account does not count as a claim.
 *
 * `personIds` narrows the sheet to those people; an id that is not eligible
 * is dropped, never printed. Without it, the whole city.
 */
export async function getCouncilQrStrips(cityId: string, personIds?: string[]): Promise<CouncilQrStrips | null> {
    const eligible = await eligibleMembers(cityId);
    if (!eligible) return null;
    const { city } = eligible;
    const wanted = personIds ? new Set(personIds) : null;
    const members = wanted ? eligible.members.filter((p) => wanted.has(p.id)) : eligible.members;

    // The councillors read the strips, so the texts follow the city's
    // language, not the admin's UI.
    const catalogLocale = catalogLocaleForCityLanguage(city.language);
    const [t, roleTitles] = await Promise.all([
        getTranslations({ locale: catalogLocale, namespace: "admin.cities.qrStrip" }),
        getRoleTitles(city.language),
    ]);
    // One expiry for all the strips: the date printed on every one of them.
    const expiresAt = claimExpiry();

    return {
        cityName: city.name,
        people: members.map((p) => ({ id: p.id, name: p.name, role: getCouncilTitle(p.roles, roleTitles), joinUrl: personJoinUrl(p, city.realm, expiresAt) })),
        texts: {
            scan: t("scan"),
            validUntil: t("validUntil", { date: formatDate(claimLastValidDay(expiresAt), city.timezone, catalogLocale) }),
            secretCode: t("secretCode"),
            privateLead: t("privateLead"),
            private: t.raw("private"),
        },
    };
}
