import { RosterPerson } from '@/lib/apiTypes';
import { PersonWithRelations } from '@/lib/db/people';
import { RoleWithRelations } from '@/lib/db/types';
import { filterActiveRoles, getRoleTitle, type RoleTitles } from '@/lib/utils/roles';

/**
 * The people a transcript task is told about, described as of the meeting
 * date. Pass the people who may speak at the meeting (getPeopleWhoMaySpeak).
 *
 * Each person lists every role they hold, the ones in the meeting's body
 * first: a municipality has a "Πρόεδρος" per body, and the chair of this
 * meeting is the one of this body.
 */
export function buildSpeakerRoster(people: PersonWithRelations[], meetingDate: Date, administrativeBodyId: string | null, roleTitles: RoleTitles): RosterPerson[] {
    return people
        .map(person => describePerson(person, meetingDate, administrativeBodyId, roleTitles))
        // getPeopleForCity returns people in random order; a stable roster keeps requests comparable.
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function describePerson(person: PersonWithRelations, meetingDate: Date, administrativeBodyId: string | null, roleTitles: RoleTitles): RosterPerson {
    const activeRoles = filterActiveRoles(person.roles, meetingDate);
    const partyRole = activeRoles.find(role => role.party);

    return {
        id: person.id,
        name: person.name,
        role: describeRolesAt(person.roles, meetingDate, administrativeBodyId, roleTitles),
        party: partyRole?.party?.name ?? null,
        ...(partyRole?.party && partyRole.isHead ? { partyHead: true } : {}),
        memberOfMeetingBody: administrativeBodyId !== null && activeRoles.some(role => role.administrativeBodyId === administrativeBodyId),
    };
}

/**
 * How every task request describes a person's offices on the meeting date:
 * each role that is not a party role, the ones in the meeting's body first,
 * as "Πρόεδρος, Δημοτικό Συμβούλιο; Αντιδήμαρχος Οικονομικών". City offices
 * are in it, which an agenda names introducers by ("Εισηγητής: ο Αντιδήμαρχος …").
 * Null for a person who holds none.
 */
export function describeRolesAt(roles: RoleWithRelations[], meetingDate: Date, administrativeBodyId: string | null, roleTitles: RoleTitles): string | null {
    const otherRoles = filterActiveRoles(roles, meetingDate).filter(role => !role.partyId);
    const rolesInMeetingBody = administrativeBodyId ? otherRoles.filter(role => role.administrativeBodyId === administrativeBodyId) : [];
    const rolesElsewhere = otherRoles.filter(role => !rolesInMeetingBody.includes(role));
    const roleNames = [...rolesInMeetingBody, ...rolesElsewhere].map(role => describeRole(role, roleTitles)).filter((name): name is string => name !== null);
    return roleNames.length > 0 ? [...new Set(roleNames)].join('; ') : null;
}

/** "Πρόεδρος, Δημοτικό Συμβούλιο" for a body role, "Δήμαρχος" for a city-level one. */
function describeRole(role: RoleWithRelations, roleTitles: RoleTitles): string | null {
    const title = getRoleTitle(role, roleTitles);
    const parts = [title, role.administrativeBody?.name ?? null].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
}
