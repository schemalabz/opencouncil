import type { Realm } from '@prisma/client';
import { REALMS } from '@/lib/realm';

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
