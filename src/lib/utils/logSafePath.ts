// Credentials that travel in the URL path: MCP keys and invite links.
const SECRET_PATH_SEGMENTS: [RegExp, string][] = [
    [/\/mcp_[A-Za-z0-9_-]+/g, '/mcp_[redacted]'],
    [/^\/api\/join\/[^/]+/, '/api/join/[redacted]'],
];

/**
 * A request path that is safe to log or to send to an alert: without its query
 * string, which can hold an unsubscribe token, a search, or an address, and
 * with the credentials in the path redacted.
 */
export function logSafePath(path: string): string {
    const withoutQuery = path.split('?')[0];
    return SECRET_PATH_SEGMENTS.reduce((p, [pattern, replacement]) => p.replace(pattern, replacement), withoutQuery);
}
