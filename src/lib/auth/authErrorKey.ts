/**
 * The message key for an Auth.js error code that reached a page through
 * `?error=` (pages.signIn and pages.error in src/auth.config.ts), or null
 * when there is no code. `keys` maps the codes a page explains to their
 * keys; anything else gets `generic`. `hasOwn`, because the code comes from
 * the URL: a plain lookup would resolve "constructor" or "__proto__" to a
 * function instead of a key.
 */
export function authErrorKey(code: string | null, keys: Record<string, string>, generic: string): string | null {
    if (!code) return null;
    return Object.hasOwn(keys, code) ? keys[code] : generic;
}
