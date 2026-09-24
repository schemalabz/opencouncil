import { RosterPerson } from '@/lib/apiTypes';
import { PersonWithRelations } from '@/lib/db/people';
import { RoleWithRelations } from '@/lib/db/types';
import { filterActiveRoles } from '@/lib/utils/roles';

/**
 * The roster fixTranscript identifies speakers from: every person of the city,
 * described as of the meeting date.
 *
 * The whole city rather than the meeting's body, because councillors and
 * officials from outside the body attend and speak. Each person lists every
 * role they hold, the ones in the meeting's body first: a municipality has a
 * "Πρόεδρος" per body, and the chair of this meeting is the one of this body.
 */
export function buildSpeakerRoster(people: PersonWithRelations[], meetingDate: Date, administrativeBodyId: string | null): RosterPerson[] {
    return people
        .map(person => describePerson(person, meetingDate, administrativeBodyId))
        // getPeopleForCity returns people in random order; a stable roster keeps requests comparable.
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function describePerson(person: PersonWithRelations, meetingDate: Date, administrativeBodyId: string | null): RosterPerson {
    const activeRoles = filterActiveRoles(person.roles, meetingDate);
    const partyRole = activeRoles.find(role => role.party);
    const otherRoles = activeRoles.filter(role => !role.partyId);
    const rolesInMeetingBody = administrativeBodyId ? otherRoles.filter(role => role.administrativeBodyId === administrativeBodyId) : [];
    const rolesElsewhere = otherRoles.filter(role => !rolesInMeetingBody.includes(role));
    const roleNames = [...rolesInMeetingBody, ...rolesElsewhere].map(describeRole).filter((name): name is string => name !== null);

    return {
        id: person.id,
        name: person.name,
        role: roleNames.length > 0 ? [...new Set(roleNames)].join('; ') : null,
        // A party head is marked: "the head of the party" is a common way to give the floor.
        party: partyRole?.party ? `${partyRole.party.name}${partyRole.isHead ? ' (head)' : ''}` : null,
        memberOfMeetingBody: rolesInMeetingBody.length > 0,
    };
}

/** "Πρόεδρος, Δημοτικό Συμβούλιο" for a body role, "Δήμαρχος" for a city-level one. */
function describeRole(role: RoleWithRelations): string | null {
    const title = role.name || (role.administrativeBody && role.isHead ? 'head' : null);
    const parts = [title, role.administrativeBody?.name ?? null].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
}
