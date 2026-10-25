"use server";

/**
 * The MCP tokens of a machine account (superadmin only). Every action gates
 * on withUserAuthorizedToEdit({}) before it reads anything: a Server Action
 * is posted by its id from any page, so the admin layout's guard does not
 * cover it. getMachineAccount answers for machine accounts only. The token
 * functions are the ones a person's /mcp page uses: a machine token is an
 * ordinary token (#590).
 */

import { withUserAuthorizedToEdit } from "@/lib/auth";
import { BadRequestError } from "@/lib/api/errors";
import { getMachineAccount } from "@/lib/db/machineAccounts";
import { createUserMcpToken, revokeUserMcpToken } from "@/lib/db/mcpTokens";
import { entityIdSchema } from "@/lib/zod-schemas/user";

function parseId(value: unknown, what: string): string {
    const parsed = entityIdSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestError(`${what} is required`);
    return parsed.data;
}

export async function mintMachineToken(accountId: string) {
    await withUserAuthorizedToEdit({});
    const account = await getMachineAccount(parseId(accountId, "An account id"));
    const token = await createUserMcpToken(account.id);
    return { id: token.id, rawToken: token.rawToken };
}

export async function revokeMachineToken(accountId: string, tokenId: string) {
    await withUserAuthorizedToEdit({});
    const account = await getMachineAccount(parseId(accountId, "An account id"));
    await revokeUserMcpToken(account.id, parseId(tokenId, "A token id"));
}
