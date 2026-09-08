import "server-only";
import type { Realm } from '@prisma/client';
import { env } from '@/env.mjs';
import { getRealmBaseUrl, isRealmApexHost } from '@/lib/realm';

/**
 * Absolute base URL for a link to `realm`'s content, trailing slash stripped.
 * Use it for any link a person clicks; see the Base URLs rule in CLAUDE.md.
 *
 * One deployment serves every realm domain, so `NEXTAUTH_URL` names one realm
 * only. City pages are tenant-isolated, so pointing another realm's content at
 * it 404s rather than redirecting.
 *
 * On a preview or localhost `NEXTAUTH_URL` is not a production apex and wins,
 * so links stay on the instance under review. That instance has one realm, so
 * a link to another realm's content opens there in Greek — append `?realm=…`
 * when that matters. A null realm keeps the configured host as is.
 */
export function realmBaseUrl(realm?: Realm | null): string {
    try {
        const configured = env.NEXTAUTH_URL.replace(/\/$/, '');
        if (!realm || !isRealmApexHost(new URL(configured).hostname)) return configured;
    } catch {
        // Unset or malformed NEXTAUTH_URL. With a realm its canonical domain
        // still works; without one there is nothing left to fall back to.
        if (!realm) throw new Error('NEXTAUTH_URL is unset or malformed, and no realm was given to fall back to');
    }
    return getRealmBaseUrl(realm!);
}
