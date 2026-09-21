"use server";

import { profileBodyConventions as profileBody } from "@/lib/tasks/profileBody";

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
