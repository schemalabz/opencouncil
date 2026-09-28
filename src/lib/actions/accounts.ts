"use server";

import { getCurrentUser } from "@/lib/auth";
import { unlinkProvider } from "@/lib/db/accounts";

/** Removes the signed-in user's Google link. Connecting goes through Auth.js itself. */
export async function disconnectGoogle(): Promise<void> {
    const user = await getCurrentUser();
    if (!user) throw new Error("Not signed in");
    await unlinkProvider(user.id, "google");
}
