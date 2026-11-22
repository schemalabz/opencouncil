// Plain CommonJS: telemetry.cjs loads it with `require` before Next starts, and
// the app imports it. One list for both, so that the request records and the
// app's own log lines redact the same paths.

/**
 * Credentials that travel in the URL path: MCP keys and invite links. The
 * patterns are not anchored at the start and accept repeated slashes, because
 * a request line can say `//api/join/<token>` or `/api//join/<token>` and still
 * reach the route.
 *
 * @type {[RegExp, string][]}
 */
const SECRET_PATH_SEGMENTS = [
    [/\/mcp_[A-Za-z0-9_-]+/g, '/mcp_[redacted]'],
    [/\/api\/+join\/+[^/]+/g, '/api/join/[redacted]'],
];

/**
 * A request path that is safe to log or to send to an alert: without its query
 * string, which can hold an unsubscribe token, a search, or an address, and
 * with the credentials in the path redacted. Percent-escapes are decoded first,
 * so that an encoded letter cannot hide a credential from the patterns. A
 * decoded control character or line separator goes back to its escape, so that
 * a path cannot start a new log line.
 *
 * @param {string} path
 * @returns {string}
 */
function logSafePath(path) {
    const withoutQuery = path.split('?')[0];
    let decoded = withoutQuery;
    try {
        decoded = decodeURIComponent(withoutQuery);
    } catch {
        // A malformed escape: match the raw text.
    }
    const printable = decoded.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, c => encodeURIComponent(c));
    return SECRET_PATH_SEGMENTS.reduce((p, [pattern, replacement]) => p.replace(pattern, replacement), printable);
}

module.exports = { logSafePath };
