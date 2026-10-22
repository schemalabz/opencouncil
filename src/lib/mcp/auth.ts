import type { AuthInfo, ServerContext } from '@modelcontextprotocol/server';
import { validateUserMcpToken } from '@/lib/db/mcpTokens';

/**
 * Who is calling the MCP server. `null` means anonymous (public reads only).
 * A token acts as the account that owns it, with that account's rights, read
 * from the database at each request (#590).
 */
export type McpIdentity = { userId: string } | null;

/**
 * Unwrap the identity verifyMcpToken stashes in AuthInfo.extra — the one
 * place that cast lives; every consumer (tool contexts, the route handler,
 * analytics) delegates here.
 */
export function identityFromAuthInfo(authInfo: AuthInfo | undefined): McpIdentity {
    return (authInfo?.extra?.identity as McpIdentity | undefined) ?? null;
}

/**
 * Read the identity that verifyMcpToken attached to the request out of a
 * tool callback's context.
 */
export function identityFromContext(ctx: ServerContext): McpIdentity {
    return identityFromAuthInfo(ctx.http?.authInfo);
}

/**
 * Token verifier for mcp-handler's withMcpAuth. Accepts personal MCP tokens
 * (mcp_…) only. Returning undefined keeps the request anonymous; throwing
 * makes present-but-invalid tokens fail loudly so misconfigured clients
 * notice. Every other prefix throws: nothing else is a credential here.
 */
export async function verifyMcpToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
    if (!bearerToken) {
        return undefined;
    }

    if (bearerToken.startsWith('mcp_')) {
        const result = await validateUserMcpToken(bearerToken);
        if (!result) {
            throw new Error('Invalid or revoked MCP token');
        }
        const identity: McpIdentity = { userId: result.userId };
        return {
            token: bearerToken,
            clientId: result.userId,
            scopes: ['highlights:write'],
            extra: { identity },
        };
    }


    throw new Error('Unrecognized token format');
}
