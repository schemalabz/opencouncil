"use server";

import { getCurrentUser } from "@/lib/auth";
import { UnauthorizedError } from "@/lib/api/errors";
import { createUserMcpToken, listUserMcpTokens, revokeUserMcpToken } from "@/lib/db/mcpTokens";

export async function createMcpToken(name: string) {
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError();

    const token = await createUserMcpToken(user.id, name.trim() || "MCP token");
    return {
        id: token.id,
        name: token.name,
        rawToken: token.rawToken,
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
}
