import type { Realm } from '@prisma/client';

/**
 * `/explain` is a long-form article about *Greek* local government — δημοτική
 * επιτροπή, Διαύγεια, the pricing we charge Greek δήμοι in euros. None of it is
 * generated from translated content, so anywhere else it is either a wall of
 * Greek text (which is what it was on opencouncil.rs) or, worse, an article about
 * the wrong country's institutions.
 *
 * Keyed on the realm rather than the locale: the page is about Greece, not about
 * the Greek language. Cyprus's default locale is `el` too, and opencouncil.cy has
 * its own local government — a locale check would keep serving it Διαύγεια. The
 * sitemap falls out of this for free, since it has a realm and no locale.
 *
 * Single source of truth for "does this realm have an explain page": the page
 * 404s when it returns false, the sitemap omits it, and every visible entry point
 * (footer link, landing info panel, landing map badge) hides itself. Keep them
 * agreeing — a link or a sitemap entry pointing at a 404 is worse than either
 * alone, and the sitemap is the one entry point no human ever looks at.
 */
export function hasExplainPage(realm: Realm): boolean {
    return realm === 'greece';
}
