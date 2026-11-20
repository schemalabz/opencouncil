import type { AuthorityType } from '@prisma/client';

/**
 * The rules that depend on the kind of local authority (#993). A `City` row
 * holds an authority, not a town: a municipality (δήμος) or a region
 * (περιφέρεια). The two share every table, so the kind is a column of the row
 * and each rule that differs between them is a function in this file.
 *
 * Type-only Prisma imports, so this is safe in client components too.
 */

export function isRegion(city: { authorityType: AuthorityType } | null | undefined): boolean {
    return city?.authorityType === 'region';
}

/**
 * The variant of a message that names the authority. Greek and Serbian inflect
 * the noun with its article ("για τον δήμο", "για την περιφέρεια"), so each
 * message carries one form for each kind and the city picks one.
 *
 * The leaf is the enum value. translation-key-references.test.ts reads a
 * `t(authorityKey('x', city))` call as a reference to one leaf for each value
 * of the enum, so a kind with no text fails there and not on a page.
 */
export function authorityKey(key: string, city: { authorityType: AuthorityType }): string {
    return `${key}.${city.authorityType}`;
}
