/**
 * The names the server gives a personal MCP address that nobody named, across
 * both versions of the /mcp form. The token manager numbers rows carrying one
 * of these by age, and keeps any other name its owner typed while the form
 * still asked for one.
 *
 * Kept out of db/mcpTokens.ts because that module is server-only, and the
 * token manager runs on the client.
 */
export const GENERATED_MCP_TOKEN_NAME = 'MCP address';

/** What the form stored when a user left the old name field empty. */
const LEGACY_GENERATED_MCP_TOKEN_NAME = 'MCP token';

export function isGeneratedMcpTokenName(name: string): boolean {
    return name === GENERATED_MCP_TOKEN_NAME || name === LEGACY_GENERATED_MCP_TOKEN_NAME;
}
