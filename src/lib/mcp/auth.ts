import type { AuthInfo, ServerContext } from '@modelcontextprotocol/server';
import { validateUserMcpToken } from '@/lib/db/mcpTokens';
import { validateServiceApiKey } from '@/lib/db/apiKeys';
import type { HighlightActor } from '@/lib/db/highlights-core';

/**
 * Who is calling the MCP server. `null` means anonymous (public reads only).
 * User tokens act as the owning user; service keys (admin panel) act as a
 * superadmin bot — same shape as HighlightActor so writes plug straight in.
 */
export type McpIdentity = HighlightActor | null;

export function isSuperIdentity(identity: McpIdentity): boolean {
    return identity?.type === 'service';
}

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
 * (mcp_…) and admin-panel service API keys (sk_…, superadmin). Returning
 * undefined keeps the request anonymous; throwing makes present-but-invalid
 * tokens fail loudly so misconfigured clients notice.
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
        const identity: McpIdentity = { type: 'user', userId: result.userId };
        return {
            token: bearerToken,
            clientId: result.userId,
            scopes: ['highlights:write'],
            extra: { identity },
        };
    }

    if (bearerToken.startsWith('sk_')) {
        const apiKey = await validateServiceApiKey(bearerToken);
        if (!apiKey) {
            throw new Error('Invalid or revoked service API key');
        }
        const identity: McpIdentity = { type: 'service', keyName: apiKey.name };
        return {
            token: bearerToken,
            clientId: `service:${apiKey.id}`,
            scopes: ['highlights:write', 'admin'],
            extra: { identity },
        };
    }

    throw new Error('Unrecognized token format');
}
