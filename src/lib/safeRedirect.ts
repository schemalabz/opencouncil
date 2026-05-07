/**
 * Returns `value` if it's a same-origin relative path safe to use as a
 * post-auth redirect target; otherwise returns `fallback`. Rejects
 * absolute URLs, protocol-relative (`//...`), and backslash-escaped
 * forms (`/\...`) — including percent-encoded variants such as
 * `/%2Fevil.com` that decode to a cross-origin form.
 */
export function safeRedirectPath(
    value: unknown,
    fallback: string = "/profile",
): string {
    if (typeof value !== "string") return fallback;

    let decoded: string;
    try {
        decoded = decodeURIComponent(value);
    } catch {
        return fallback; // malformed percent-encoding
    }

    const isSafe = (s: string) =>
        s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\");

    // Both the raw and the decoded form must be same-origin relative paths.
    if (!isSafe(value) || !isSafe(decoded)) return fallback;

    return value;
}
