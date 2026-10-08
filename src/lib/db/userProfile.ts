import "server-only";

import type { User } from "@prisma/client";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * The fields a reader edits on their own profile. The number is not among
 * them: setAccountPhone, clearPhone and the code confirmation in
 * phoneVerification.ts are its only writers, because every write of the
 * number must also settle its proof.
 */
export type UserProfileUpdateData = Partial<
    Pick<User, "name" | "allowProductUpdates" | "allowPetitionUpdates" | "allowFeedbackCalls" | "onboarded">
>;

export async function updateUserProfile(id: string, data: UserProfileUpdateData): Promise<User> {
    // Self-service profile edit: the actor may only edit their own profile.
    // Superadmins may edit anyone. Token-authorized flows (e.g. email
    // unsubscribe, which has no session) must not use this — they call a
    // dedicated, token-scoped function instead.
    const actor = await getCurrentUser();
    if (!actor || (actor.id !== id && !actor.isSuperAdmin)) {
        throw new Error("Not authorized");
    }
    try {
        const updatedUser = await prisma.user.update({
            where: { id },
            data,
        });
        return updatedUser;
    } catch (error) {
        console.error("Failed to update user profile:", error);
        throw new Error("Failed to update user profile");
    }
}
