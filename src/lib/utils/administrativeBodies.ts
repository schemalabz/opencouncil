import { PersonWithRelations } from '../db/people';
import { AdministrativeBody, AdministrativeBodyType } from '@prisma/client';
import { hasCityLevelRole } from './roles';

/** Minimal type for meetings - only what we need for extracting admin bodies */
type MeetingWithAdminBody = {
    administrativeBody: AdministrativeBody | null;
};

/** Canonical ordering for admin body types */
const ADMIN_BODY_TYPE_ORDER: AdministrativeBodyType[] = ['council', 'committee', 'community'];

/**
 * Extract which admin body types exist from a flat list of admin bodies.
 * Returns options ordered: council -> committee -> community.
 */
function getAdministrativeBodyTypes(
    bodies: (AdministrativeBody | null | undefined)[],
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
            label: t(`adminBodyType_${type}`)
        }));
}

/**
 * Extract individual bodies of a given type, sorted alphabetically.
 */
function getBodiesOfType(
    bodies: (AdministrativeBody | null | undefined)[],
    type: AdministrativeBodyType
): { value: string; label: string }[] {
    const map = new Map<string, string>();
    for (const body of bodies) {
        if (body?.type === type) {
            map.set(body.id, body.name);
        }
    }
    return Array.from(map, ([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'el'));
}

/** Extract admin body types present in a list of meetings */
export function getAdministrativeBodyTypesForMeetings(
    meetings: MeetingWithAdminBody[],
    t: (key: string) => string
): { value: AdministrativeBodyType; label: string }[] {
    return getAdministrativeBodyTypes(meetings.map(m => m.administrativeBody), t);
}

/** Extract admin body types present in people's roles */
export function getAdministrativeBodyTypesForPeople(
    people: PersonWithRelations[],
    t: (key: string) => string
): { value: AdministrativeBodyType; label: string }[] {
    return getAdministrativeBodyTypes(people.flatMap(p => p.roles.map(r => r.administrativeBody)), t);
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
 * Filter a meeting by selected admin body types.
 * Empty selectedTypes = show all.
 */
export function filterMeetingByAdminBodyTypes(
    meeting: MeetingWithAdminBody,
    selectedTypes: AdministrativeBodyType[]
): boolean {
    if (selectedTypes.length === 0) return true;
    if (!meeting.administrativeBody) return false;
    return selectedTypes.includes(meeting.administrativeBody.type);
}

/**
 * Filter a person by selected admin body types.
 * City-level roles (mayors) are included only when 'council' is selected.
 * Empty selectedTypes = show all.
 */
export function filterPersonByAdminBodyTypes(
    person: PersonWithRelations,
    selectedTypes: AdministrativeBodyType[]
): boolean {
    if (selectedTypes.length === 0) return true;
    if (selectedTypes.includes('council') && hasCityLevelRole(person.roles)) return true;
    return person.roles.some(role =>
        role.administrativeBody &&
        selectedTypes.includes(role.administrativeBody.type)
    );
}
