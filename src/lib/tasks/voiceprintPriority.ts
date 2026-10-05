import { PersonWithRelations } from '@/lib/db/people';
import { getRoleTypePriority } from '@/lib/utils';
import { isRoleActiveAt } from '@/lib/utils/roles';

/**
 * Whose voiceprint goes first when a meeting has more than the matching
 * service takes. The list holds people from outside the body that is meeting,
 * so role priority alone could leave out one of the body's own members.
 *
 * - 0: holds a city-level role on the meeting date (mayor, deputy mayor, general secretary)
 * - 1: a member of the body that is meeting, on the meeting date
 * - 2: everyone else
 *
 * Only roles held on the meeting date count: a former deputy mayor does not
 * go ahead of a current member.
 */
export function voiceprintPriorityGroup(person: PersonWithRelations, meetingBodyId: string | null, meetingDate: Date): 0 | 1 | 2 {
    const currentRoles = person.roles.filter(role => isRoleActiveAt(role, meetingDate));
    if (currentRoles.some(role => getRoleTypePriority(role) <= 1)) return 0;
    const isMember = meetingBodyId !== null && currentRoles.some(role => role.administrativeBodyId === meetingBodyId);
    return isMember ? 1 : 2;
}
