import "server-only";
import { getTranslations } from "next-intl/server";
import { getCity } from "@/lib/db/cities";
import { getPeopleForCity, type PersonWithRelations } from "@/lib/db/people";
import { getClaimedPersonIds } from "@/lib/db/personClaim";
import { claimExpiry, claimLastValidDay, personJoinUrl } from "@/lib/auth/personClaim";
import { isCouncillorTitleRole, isDeputyMayorRole, isMayor } from "@/lib/utils/roles";
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
 * The title under a name on a strip: the city-level role (Δήμαρχος,
 * Αντιδήμαρχος …) when there is one, else the council role (Πρόεδρος …).
 * Plain members have neither. The roles are the active ones already: the
 * query below asks for those.
 */
/**
 * Who gets a strip: a council member, the mayor or a deputy mayor. A council
 * seat is enough on its own; without one, the city-level title decides. Not
 * every city-level role: a General Secretary is city staff, not elected, and
 * must not be able to claim a page, so an unrecognised title gets no strip.
 * The roles are the active ones already.
 */
function isCouncilMemberOrMayor(person: PersonWithRelations): boolean {
    return (
        isMayor(person) ||
        person.roles.some(
            (r) => r.administrativeBody?.type === "council" || isDeputyMayorRole(r) || isCouncillorTitleRole(r),
        )
    );
}

function roleLabel(person: PersonWithRelations): string | null {
    const cityRole = person.roles.find((r) => r.cityId && !r.partyId && !r.administrativeBodyId);
    const councilRole = person.roles.find((r) => r.administrativeBody?.type === "council");
    return cityRole?.name ?? councilRole?.name ?? null;
}

/**
 * What the strips PDF of a city needs, with claim tokens minted now: every
 * call gives new codes, each valid for the claim lifetime from this moment.
 * Codes from an earlier call stay valid until they expire. Null for an
 * unknown city.
 *
 * Council members, the mayor and the deputy mayors, in the order of the
 * people page. A person who already has an administrator gets no strip:
 * their code would be refused.
 */
export async function getCouncilQrStrips(cityId: string): Promise<CouncilQrStrips | null> {
    const [city, people, claimed] = await Promise.all([
        getCity(cityId),
        getPeopleForCity(cityId, true),
        getClaimedPersonIds(cityId),
    ]);
    if (!city) return null;

    // The councillors read the strips, so the texts follow the city's
    // language, not the admin's UI.
    const t = await getTranslations({ locale: city.language, namespace: "admin.cities.qrStrip" });
    // One expiry for all the strips: the date printed on every one of them.
    const expiresAt = claimExpiry();

    const members = sortPeople(people.filter(isCouncilMemberOrMayor), "council");
    return {
        cityName: city.name,
        people: members
            .filter((p) => !claimed.has(p.id))
            .map((p) => ({ id: p.id, name: p.name, role: roleLabel(p), joinUrl: personJoinUrl(p, city.realm, expiresAt) })),
        texts: {
            scan: t("scan"),
            validUntil: t("validUntil", { date: formatDate(claimLastValidDay(expiresAt), city.timezone, city.language) }),
            secretCode: t("secretCode"),
            privateLead: t("privateLead"),
            private: t.raw("private"),
        },
    };
}
