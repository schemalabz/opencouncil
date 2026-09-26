"use server";

import { profileBodyConventions as profileBody } from "@/lib/tasks/profileBody";
import { getAdministrativeBodiesWithPublicMeetings as bodiesWithPublicMeetings } from "@/lib/db/administrativeBodies";

/**
 * Browser-facing start of a body's conventions profile, for the administrative
 * body form.
 *
 * The task module is server-only. profileBodyConventions gates on
 * withUserAuthorizedToEdit for the body's own city before it starts anything.
 */
export async function profileBodyConventions(administrativeBodyId: string): Promise<{ taskId: string }> {
    return profileBody(administrativeBodyId);
}

/** The bodies of a city with a released meeting, for the public search filters. Public data; no gate. */
export async function getAdministrativeBodiesWithPublicMeetings(cityId: string) {
    return bodiesWithPublicMeetings(cityId);
}
