import { isTrustedExternalRedirect } from './trustedRedirect';

/**
 * The callbackUrl to offer again after an error redirect, from the value
 * Auth.js kept in its callback-url cookie. Auth.js stores it absolute,
 * resolved against the deployment's base URL, so a same-origin value comes
 * back as the path the sign-in forms accept (safeRedirectPath rejects
 * absolute URLs). A trusted other host (a realm apex, the Notis admin) stays
 * absolute, as the query form of callbackUrl already allows. Anything else
 * is dropped.
 */
export function storedCallbackUrl(stored: string | undefined, baseUrl: string): string | null {
    if (!stored) return null;
    try {
        const url = new URL(stored, baseUrl);
        if (url.origin === new URL(baseUrl).origin) return `${url.pathname}${url.search}`;
    } catch {
        return null;
    }
    return isTrustedExternalRedirect(stored) ? stored : null;
}
