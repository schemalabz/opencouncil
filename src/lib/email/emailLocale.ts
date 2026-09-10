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

/**
 * The language to write an email about `realm`'s content in.
 *
 * A null realm means there is no city to derive one from — a product-update
 * broadcast. It falls back to greece, matching `realmForHost`'s default for an
 * unknown host and the `el` these emails defaulted to before realms existed.
 */
export function emailLocaleForRealm(realm: Realm | null): EmailLocale {
    return REALMS[realm ?? 'greece'].defaultLocale;
}
