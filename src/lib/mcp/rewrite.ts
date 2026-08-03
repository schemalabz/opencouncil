import { localePrefixPattern } from '@/i18n/config';

/**
 * Decide whether a request to /mcp or /mcp/{token} is an MCP protocol request
 * that should be rewritten to the API route handler, or a page request that
 * should fall through to the /mcp instructions page.
 *
 * Pure function so the proxy's routing decision is unit-testable. Must stay
 * edge-runtime safe (no node imports) — it runs inside src/proxy.ts.
 */
const MCP_TOKEN_PATH = /^\/mcp\/((?:mcp_|sk_)[A-Za-z0-9_-]+)$/;

// A user can copy the instructions page's locale-prefixed URL (/en/mcp) from
// the address bar into their MCP client instead of the canonical /mcp, so
// protocol detection ignores a leading locale segment.
const LOCALE_PREFIX = new RegExp(`^/(?:${localePrefixPattern})(?=/)`);

export function mcpRewriteTarget(
    pathname: string,
    method: string,
    acceptHeader: string | null,
    contentTypeHeader: string | null
): string | null {
    const path = pathname.replace(LOCALE_PREFIX, '');

    const tokenMatch = path.match(MCP_TOKEN_PATH);
    if (tokenMatch) {
        // Tokened URLs are never pages — always the protocol endpoint.
        return `/api/mcp/${tokenMatch[1]}`;
    }

    if (path !== '/mcp') {
        return null;
    }

    // MCP protocol traffic on the shared /mcp URL:
    // - POST: JSON-RPC, always Content-Type: application/json per the spec.
    //   The content-type check is what keeps the page's own POSTs — Next.js
    //   server actions post text/plain or multipart to the page URL — out of
    //   the protocol handler.
    // - GET: only the SSE stream, advertised via the Accept header.
    // - DELETE: session teardown (no page equivalent).
    // Everything else (browser GETs, server actions) renders the page.
    const wantsProtocol =
        (method === 'POST' && (contentTypeHeader ?? '').includes('application/json')) ||
        (method === 'GET' && (acceptHeader ?? '').includes('text/event-stream')) ||
        method === 'DELETE';

    return wantsProtocol ? '/api/mcp' : null;
}
