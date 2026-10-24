import "server-only";
import { getRealm } from '@/lib/realm.server';
import { realmBaseUrl } from '@/lib/utils/realmBaseUrl';

/**
 * The MCP server's address for the current request. It must match how
 * `/api/mcp` resolves the realm — from the request Host — or the reader
 * pastes a connector scoped to the wrong realm for good.
 */
export async function mcpBaseUrl(): Promise<string> {
    return `${realmBaseUrl(await getRealm())}/mcp`;
}
