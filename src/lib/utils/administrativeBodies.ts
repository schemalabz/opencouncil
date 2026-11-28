import { PersonWithRelations } from '../db/people';
import { AdministrativeBodyType, type AuthorityType } from '@prisma/client';
import type { PublicAdministrativeBody } from '@/lib/db/types';
import { isRegion, isRegionBodyType } from './authority';
import { hasCityLevelRole, isRoleActive } from './roles';

/** Minimal type for meetings - only what we need for extracting admin bodies */
type MeetingWithAdminBody = {
    administrativeBody: PublicAdministrativeBody | null;
};

/** Canonical ordering for admin body types. The secondary tier (see bodyTier.ts) closes the list. */
export const ADMIN_BODY_TYPE_ORDER: AdministrativeBodyType[] = ['council', 'committee', 'community', 'youthCouncil'];

/**
 * Where a body type sits in {@link ADMIN_BODY_TYPE_ORDER}. A type that is absent
 * or unknown sorts after every known one, so a person with no seat closes a list
 * rather than opening it.
 */
export function administrativeBodyTypeRank(type: AdministrativeBodyType | null | undefined): number {
    const index = type ? ADMIN_BODY_TYPE_ORDER.indexOf(type) : -1;
    return index === -1 ? ADMIN_BODY_TYPE_ORDER.length : index;
}

/** Orders two administrative bodies as every list of bodies shows them: by type, then by name. */
export function compareAdministrativeBodies(
    a: { name: string; type: AdministrativeBodyType },
    b: { name: string; type: AdministrativeBodyType },
): number {
    return administrativeBodyTypeRank(a.type) - administrativeBodyTypeRank(b.type)
        || a.name.localeCompare(b.name, 'el');
}

/** Whether an unvalidated value — a URL parameter — names an admin body type. */
export function isAdministrativeBodyType(value: string | undefined): value is AdministrativeBodyType {
    return (Object.values(AdministrativeBodyType) as string[]).includes(value ?? '');
}

/** Narrow an unvalidated value — a URL parameter — to an admin body type. */
export function toAdministrativeBodyType(value: string | undefined): AdministrativeBodyType | undefined {
    return isAdministrativeBodyType(value) ? value : undefined;
}

/** The city of a body, as far as the label of its type needs it. */
type BodyTypeLabelCity = { authorityType: AuthorityType };

/**
 * The label of a body type in a region (#993), or null when the municipal
 * label applies: the city is a municipality, or the type is not one that a
 * region has. A caller with its own municipal label falls back to it.
 *
 * @translationNamespace Common
 */
export function getRegionBodyTypeLabel(
    type: AdministrativeBodyType,
    city: BodyTypeLabelCity,
    t: (key: string) => string
): string | null {
    return isRegion(city) && isRegionBodyType(type) ? t(`regionBodyType_${type}`) : null;
}

/**
 * The label of a body type: «Δημοτικό Συμβούλιο» in a municipality,
 * «Περιφερειακό Συμβούλιο» in a region. The meetings tab stores a selection by
 * this label, so every link to the tab must read the label here.
 *
 * @translationNamespace Common
 */
export function getBodyTypeLabel(
    type: AdministrativeBodyType,
    city: BodyTypeLabelCity,
    t: (key: string) => string
): string {
    return getRegionBodyTypeLabel(type, city, t) ?? t(`adminBodyType_${type}`);
}

/**
 * The types present in a set of bodies, as options ordered council, committee,
 * community. Prefer this over the meeting-derived wrapper when the caller has
 * the city's own bodies: a list capped to a window of meetings knows only the
 * bodies inside that window, so a body that last met before it would offer no
 * chip at all.
 */
export function getAdministrativeBodyTypes(
    bodies: (PublicAdministrativeBody | null | undefined)[],
    city: BodyTypeLabelCity,
    t: (key: string) => string
): { value: AdministrativeBodyType; label: string }[] {
    const typesPresent = new Set<AdministrativeBodyType>();
    for (const body of bodies) {
        if (body) typesPresent.add(body.type);
    }
    return ADMIN_BODY_TYPE_ORDER
        .filter(type => typesPresent.has(type))
        .map(type => ({
            value: type,
            label: getBodyTypeLabel(type, city, t)
        }));
}

/**
 * The distinct bodies among `bodies`, as picker options: in
 * {@link compareAdministrativeBodies} order, so council, then committee, then
 * community, and by name within a type.
 */
export function getBodyOptions(
    bodies: (PublicAdministrativeBody | null | undefined)[]
): { value: string; label: string }[] {
    const byId = new Map<string, PublicAdministrativeBody>();
    for (const body of bodies) {
        if (body) byId.set(body.id, body);
    }
    return [...byId.values()].sort(compareAdministrativeBodies).map(body => ({ value: body.id, label: body.name }));
}

/** The bodies of one type, sorted by name. Same caveat as {@link getAdministrativeBodyTypes}. */
export function getBodiesOfType(
    bodies: (PublicAdministrativeBody | null | undefined)[],
    type: AdministrativeBodyType
): { value: string; label: string }[] {
    return getBodyOptions(bodies.filter(body => body?.type === type));
}

/** Extract admin body types present in a list of meetings */
export function getAdministrativeBodyTypesForMeetings(
    meetings: MeetingWithAdminBody[],
    city: BodyTypeLabelCity,
    t: (key: string) => string
): { value: AdministrativeBodyType; label: string }[] {
    return getAdministrativeBodyTypes(meetings.map(m => m.administrativeBody), city, t);
}

/** Extract admin body types present in people's roles */
export function getAdministrativeBodyTypesForPeople(
    people: PersonWithRelations[],
    city: BodyTypeLabelCity,
    t: (key: string) => string
): { value: AdministrativeBodyType; label: string }[] {
    return getAdministrativeBodyTypes(people.flatMap(p => p.roles.map(r => r.administrativeBody)), city, t);
}

/** Extract individual bodies of a given type from meetings, sorted alphabetically */
export function getBodiesOfTypeFromMeetings(
    meetings: MeetingWithAdminBody[],
    type: AdministrativeBodyType
): { value: string; label: string }[] {
    return getBodiesOfType(meetings.map(m => m.administrativeBody), type);
}

/** Extract individual bodies of a given type from people's roles, sorted alphabetically */
export function getBodiesOfTypeFromPeople(
    people: PersonWithRelations[],
    type: AdministrativeBodyType
): { value: string; label: string }[] {
    return getBodiesOfType(people.flatMap(p => p.roles.map(r => r.administrativeBody)), type);
}

/**
 * Whether a person belongs in the council's view without a council seat: any
 * city-level role. The mayor and the deputy mayors hold one, and a reader
 * looks for them with the council. The one statement of that rule; both
 * filters below read it.
 */
function sitsWithCouncil(person: PersonWithRelations): boolean {
    return hasCityLevelRole(person.roles);
}

/**
 * Whether a person sits on one body now: the per-body sibling of
 * {@link filterPersonByAdminBodyTypes}, with the same council rule and the
 * same active-roles-only reading.
 */
export function personSitsOnBody(
    person: PersonWithRelations,
    body: { id: string; type: AdministrativeBodyType }
): boolean {
    if (body.type === 'council' && sitsWithCouncil(person)) return true;
    return person.roles.some(role => isRoleActive(role) && role.administrativeBodyId === body.id);
}

/**
 * Filter a person by selected admin body types.
 * Only currently-active roles are considered, so members whose membership has
 * ended are excluded (e.g. a former committee member is hidden under 'committee').
 * City-level roles (mayors) are included only when 'council' is selected.
 * Empty selectedTypes = show all.
 */
export function filterPersonByAdminBodyTypes(
    person: PersonWithRelations,
    selectedTypes: AdministrativeBodyType[]
): boolean {
    if (selectedTypes.length === 0) return true;
    if (selectedTypes.includes('council') && sitsWithCouncil(person)) return true;
    return person.roles.some(role =>
        isRoleActive(role) &&
        role.administrativeBody &&
        selectedTypes.includes(role.administrativeBody.type)
    );
}

/**
 * Whether the page of a body offers «Νέα θητεία», which ends every active
 * membership of the body at once (#829). A council is elected with its
 * parties and its elected order, and OpenCouncil loads the new council after
 * an election, so the page of a council does not end all its seats.
 */
export function mayStartNewTerm(body: { type: AdministrativeBodyType }): boolean {
    return body.type !== 'council';
}
