"use server";

import { getAdministrativeBodiesWithPublicMeetings as bodiesWithPublicMeetings } from "@/lib/db/administrativeBodies";

/** The bodies of a city with a released meeting, for the public search filters. Public data; no gate. */
export async function getAdministrativeBodiesWithPublicMeetings(cityId: string) {
    return bodiesWithPublicMeetings(cityId);
}
