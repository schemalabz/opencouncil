"use server";

import {
    canAccessMyHighlights as canAccess,
    deleteHighlight as remove,
    renameHighlight as rename,
} from "@/lib/db/highlights";

/**
 * Browser-facing highlight actions for the highlight menu and the account
 * links. The data module is server-only: it also reads the highlights of a
 * meeting for the meeting page, which a browser must not reach by id. Each
 * function below gates on the session in its own body.
 */

/** Whether to offer the signed-in user the personal highlights page. */
export async function canAccessMyHighlights(): Promise<boolean> {
    return canAccess();
}

/** The author of the highlight, or a holder of `highlight.manage` on its meeting. */
export async function renameHighlight(id: string, name: string): Promise<void> {
    return rename(id, name);
}

/** The author of the highlight, or a holder of `highlight.manage` on its meeting. */
export async function deleteHighlight(id: string): Promise<void> {
    return remove(id);
}
