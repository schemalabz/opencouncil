import type { Realm } from '@prisma/client';
import { REALMS, getRealmBaseUrl, isRealmApexHost } from '@/lib/realm';
import { env } from '@/env.mjs';

/**
 * The locales a realm-addressed email can be written in: every realm's default
 * locale, and nothing else. Transactional emails triggered by a task callback
 * have no request to read a script/locale preference from, so the realm the
 * content belongs to is the only signal available.
 *
 * Derived from `REALMS`, so adding a realm on a new language fails compilation
 * in every email copy table until that language's copy exists.
 */
export type EmailLocale = (typeof REALMS)[Realm]['defaultLocale'];

/** The language to write an email about `realm`'s content in. */
export function emailLocaleForRealm(realm: Realm): EmailLocale {
    return REALMS[realm].defaultLocale;
}

/**
 * Absolute base URL for a link in an email about `realm`'s content.
 *
 * In production this must be the realm's own domain: `NEXTAUTH_URL` is a single
 * build-time host, so using it sends every realm's readers to opencouncil.gr —
 * where the link 404s, because the city lives on another realm's site.
 *
 * On a preview or local instance `NEXTAUTH_URL` is not a production apex, and
 * the reader is testing *that* instance rather than production, so it wins.
 * Caveat: a preview host resolves to the greece realm, so a link to another
 * realm's content opens there in Greek — realm is a property of the domain, and
 * a preview has only one. Append `?realm=…` by hand when that matters.
 */
export function emailBaseUrlForRealm(realm: Realm): string {
    try {
        const configured = env.NEXTAUTH_URL.replace(/\/$/, '');
        if (!isRealmApexHost(new URL(configured).host)) return configured;
    } catch {
        // unset or malformed NEXTAUTH_URL — the realm's canonical domain still works
    }
    return getRealmBaseUrl(realm);
}
