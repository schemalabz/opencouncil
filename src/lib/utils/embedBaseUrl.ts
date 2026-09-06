import type { Realm } from '@prisma/client';
import { env } from '@/env.mjs';
import { getRealmBaseUrl, isRealmApexHost } from '@/lib/realm';

/**
 * Base URL for the links a widget renders (trailing slash stripped).
 *
 * In production `NEXTAUTH_URL` is one realm's apex (opencouncil.gr), but a
 * widget for a city of another realm must link to that realm's own domain: a
 * `vouli` iframe on a Cypriot site pointing visitors at opencouncil.gr would
 * cross the tenant boundary. On a preview or local host `NEXTAUTH_URL` is kept
 * as is, so links stay on the host under review.
 */
export function embedBaseUrl(realm?: Realm | null): string {
    const configured = env.NEXTAUTH_URL.replace(/\/$/, '');
    if (!realm) return configured;
    return isRealmApexHost(new URL(configured).hostname) ? getRealmBaseUrl(realm) : configured;
}
