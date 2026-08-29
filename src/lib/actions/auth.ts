"use server";

import {
    isUserAuthorizedToEdit as checkUserAuthorization,
    type AuthorizationScope,
} from "@/lib/auth";

/**
 * Browser-facing permission check for edit controls.
 *
 * The internal authorization module is server-only. This action exposes only
 * the boolean result that interactive components need.
 */
export async function isUserAuthorizedToEdit(scope: AuthorizationScope): Promise<boolean> {
    return checkUserAuthorization(scope);
}
