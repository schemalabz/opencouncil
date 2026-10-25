import { safeRedirectPath } from '@/lib/safeRedirect';

function isSignInPath(path: string): boolean {
    const clean = path.split('?')[0].split('#')[0];
    return /(^|\/)sign-in$/.test(clean);
}

/**
 * Builds a sign-in path carrying a destination (callbackUrl).
 * If no destination is given, or if the destination is the sign-in page itself,
 * returns "/sign-in" without a redundant destination.
 */
export function signInPath(callbackUrl?: string | null): string {
    if (!callbackUrl || isSignInPath(callbackUrl)) return '/sign-in';
    return `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

/**
 * Post-sign-in fallback when no destination was specified:
 * - An onboarded reader goes to the homepage ("/").
 * - A reader whose profile is not complete goes to "/profile".
 */
export function postSignInFallback(onboarded: boolean): string {
    return onboarded ? '/' : '/profile';
}

/**
 * Resolves the destination for a completed sign-in.
 * An explicit, safe callbackUrl takes precedence; otherwise, returns the fallback.
 * Prevents redirect loops if callbackUrl points back to the sign-in page.
 */
export function resolvePostSignInPath({
    callbackUrl,
    onboarded,
    fallback,
}: {
    callbackUrl?: string | null;
    onboarded: boolean;
    fallback?: string;
}): string {
    const resolvedFallback = fallback ?? postSignInFallback(onboarded);
    const target = safeRedirectPath(callbackUrl, resolvedFallback);
    if (isSignInPath(target)) {
        return resolvedFallback;
    }
    return target;
}
