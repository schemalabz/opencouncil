// Plain CommonJS: telemetry.cjs loads it with `require` before Next starts, and
// the app imports it. One list for both, so that the request records and the
// app's own log lines redact the same paths.

// Credentials that travel in the URL path: MCP keys and invite links.
const SECRET_PATH_SEGMENTS = [
    [/\/mcp_[A-Za-z0-9_-]+/g, '/mcp_[redacted]'],
    [/^\/api\/join\/[^/]+/, '/api/join/[redacted]'],
];

/**
 * A request path that is safe to log or to send to an alert: without its query
 * string, which can hold an unsubscribe token, a search, or an address, and
 * with the credentials in the path redacted.
 *
 * @param {string} path
 * @returns {string}
 */
function logSafePath(path) {
    const withoutQuery = path.split('?')[0];
    return SECRET_PATH_SEGMENTS.reduce((p, [pattern, replacement]) => p.replace(pattern, replacement), withoutQuery);
}

module.exports = { logSafePath };
