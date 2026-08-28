"use server";

import { getCurrentUser } from "@/lib/auth";
import { UnauthorizedError } from "@/lib/api/errors";
import { createUserMcpToken, listUserMcpTokens, revokeUserMcpToken } from "@/lib/db/mcpTokens";

/**
 * Both writes return the whole list the caller should now render.
 *
 * The token manager labels each address by its position, so the order has one
 * source of truth: this query. A client that patched its own copy would have
 * to guess where a new row sorts, and would miss anything another tab created
 * — either way its labels drift from the list a reload produces.
 */
export async function createMcpToken() {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();

    const token = await createUserMcpToken(user.id);
    return {
        id: token.id,
        rawToken: token.rawToken,
        tokens: await listUserMcpTokens(user.id),
    };
}

export async function listMcpTokens() {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();

    return listUserMcpTokens(user.id);
}

export async function revokeMcpToken(tokenId: string) {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();

    await revokeUserMcpToken(user.id, tokenId);
    return listUserMcpTokens(user.id);
}
