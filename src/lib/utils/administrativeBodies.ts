import { PersonWithRelations } from '../db/people';
import { AdministrativeBody, AdministrativeBodyType } from '@prisma/client';

export interface AdministrativeBodyOption {
    value: string | null;
    label: string;
}

interface AdministrativeBodyWithType {
    value: string;
    label: string;
    type: AdministrativeBodyType;
}

/**
 * Sort administrative bodies: council first, committees second, communities alphabetically
 */
function sortAdministrativeBodies(bodies: AdministrativeBodyWithType[]): AdministrativeBodyWithType[] {
    return bodies.sort((a, b) => {
        // Council first
        if (a.type === 'council' && b.type !== 'council') return -1;
        if (a.type !== 'council' && b.type === 'council') return 1;

        // Committees second
        if (a.type === 'committee' && b.type === 'community') return -1;
        if (a.type === 'community' && b.type === 'committee') return 1;

        // Within same type, sort alphabetically by label
        return a.label.localeCompare(b.label, 'el');
    });
}

/**
 * Extract and sort administrative bodies from a list of people
 * Returns bodies sorted by: council first, committees second, communities alphabetically,
 * with "Άλλοι" at the end if any person has no administrative body role
 */
export function getAdministrativeBodiesForPeople(
    people: PersonWithRelations[]
): AdministrativeBodyOption[] {
    // Extract unique administrative bodies
    const adminBodiesMap = new Map(
        people
            .flatMap(person => person.roles
                .filter(role => role.administrativeBody)
                .map(role => [
                    role.administrativeBody!.id,
                    {
                        value: role.administrativeBody!.id,
                        label: role.administrativeBody!.name,
                        type: role.administrativeBody!.type
                    }
                ])
            )
    );

    const sortedBodies = sortAdministrativeBodies(Array.from(adminBodiesMap.values()));

    // Check if any person has no administrative body role
    const hasNoAdminBody = people.some(person =>
        !person.roles.some(role => role.administrativeBody)
    );

    return [
        ...sortedBodies.map(({ value, label }) => ({ value, label })),
        ...(hasNoAdminBody ? [{
            value: null as string | null,
            label: "Άλλοι"
        }] : [])
    ];
}

/** Minimal type for meetings - only what we need for extracting admin bodies */
type MeetingWithAdminBody = {
    administrativeBody: AdministrativeBody | null;
};

/**
 * Extract and sort administrative bodies from a list of meetings
 * Returns bodies sorted by: council first, committees second, communities alphabetically,
 * with "Χωρίς διοικητικό όργανο" at the end if any meeting has no admin body
 */
export function getAdministrativeBodiesForMeetings(
    meetings: MeetingWithAdminBody[]
): AdministrativeBodyOption[] {
    // Extract unique administrative bodies
    const adminBodiesMap = new Map<string, AdministrativeBodyWithType>();
    
    for (const meeting of meetings) {
        if (meeting.administrativeBody) {
            adminBodiesMap.set(meeting.administrativeBody.id, {
                value: meeting.administrativeBody.id,
                label: meeting.administrativeBody.name,
                type: meeting.administrativeBody.type
            });
        }
    }

    const sortedBodies = sortAdministrativeBodies(Array.from(adminBodiesMap.values()));

    // Check if any meeting has no administrative body
    const hasNoAdminBody = meetings.some(meeting => !meeting.administrativeBody);

    return [
        ...sortedBodies.map(({ value, label }) => ({ value, label })),
        ...(hasNoAdminBody ? [{
            value: null as string | null,
            label: "Χωρίς διοικητικό όργανο"
        }] : [])
    ];
}

/**
 * Get default filter values for administrative bodies
 * Returns [Δημοτικό Συμβούλιο, Άλλοι/Χωρίς διοικητικό όργανο] if they exist, otherwise undefined or all bodies
 *
 * @param bodies - List of administrative body options
 * @param fallbackToAll - If true and no defaults found, return all bodies. If false, return undefined
 */
export function getDefaultAdministrativeBodyFilters(
    bodies: AdministrativeBodyOption[],
    fallbackToAll: boolean = false
): (string | null)[] | undefined {
    const councilBody = bodies.find(body => body.label === "Δημοτικό Συμβούλιο");
    // "Άλλοι" is used for people without admin body, "Χωρίς διοικητικό όργανο" for meetings
    const noAdminBody = bodies.find(body => body.label === "Άλλοι" || body.label === "Χωρίς διοικητικό όργανο");

    const defaults: (string | null)[] = [];
    if (councilBody) defaults.push(councilBody.value);
    if (noAdminBody) defaults.push(noAdminBody.value);

    if (defaults.length > 0) {
        return defaults;
    }

    return fallbackToAll ? bodies.map(b => b.value) : undefined;
}
