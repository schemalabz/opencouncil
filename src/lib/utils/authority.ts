import type { AdministrativeBodyType, AuthorityType, DocumentKind } from '@prisma/client';

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

/**
 * The body types of a region: the regional council and its committees. A
 * region has no communities and no youth council.
 *
 * A const array: translation-key-references.test.ts reads from it the members
 * of the message group that names the bodies of a region.
 */
export const REGION_BODY_TYPES = ['council', 'committee'] as const satisfies readonly AdministrativeBodyType[];
export type RegionBodyType = (typeof REGION_BODY_TYPES)[number];

export function isRegionBodyType(type: AdministrativeBodyType): type is RegionBodyType {
    return (REGION_BODY_TYPES as readonly AdministrativeBodyType[]).includes(type);
}

/** The body types each kind of authority may have. Null is every type. */
const BODY_TYPES: Record<AuthorityType, readonly AdministrativeBodyType[] | null> = {
    municipality: null,
    region: REGION_BODY_TYPES,
};

/** Whether an authority of this kind may have a body of this type. */
export function authorityAllowsBodyType(city: { authorityType: AuthorityType }, type: AdministrativeBodyType): boolean {
    const allowed = BODY_TYPES[city.authorityType];
    return allowed === null || allowed.includes(type);
}

/** The text of the error for a body type that an authority of this kind may not have. */
export function bodyTypeRefusal(city: { authorityType: AuthorityType }, type: AdministrativeBodyType): string {
    return `A ${city.authorityType} has no administrative body of type ${type}`;
}

/**
 * Whether each meeting of an authority of this kind must name its body.
 *
 * A meeting with no body reads as a meeting of the council everywhere: on the
 * pages, and in the task backend, which names the council in its prompts. A
 * municipality has such meetings from the time before the bodies. A region
 * has several committees, and a committee meeting with no body would read as a
 * meeting of the regional council, so a region has no such meeting.
 */
export function authorityRequiresMeetingBody(city: { authorityType: AuthorityType }): boolean {
    return isRegion(city);
}

/**
 * Whether a subject of an authority of this kind keeps a location only when
 * the location is inside the boundary of the authority.
 *
 * A region holds many towns, and the same street name exists in several of
 * them and in the towns of other regions. The geocoder of the task backend can
 * then put the pin in the wrong town. A municipality keeps each location as the
 * backend sends it, as before.
 */
export function authorityBoundsSubjectLocations(city: { authorityType: AuthorityType }): boolean {
    return isRegion(city);
}

/**
 * Whether the platform builds this document for an authority of this kind.
 *
 * The minutes hold municipal law: the mayor attends the council and has no
 * vote, and the document prints the line of the mayor. Nobody checked the rule
 * for the head of a region yet (#993, task 8), so a region gets no minutes: no
 * preview, no DOCX and no email to its back office.
 */
export function authorityHasDocument(city: { authorityType: AuthorityType }, kind: DocumentKind): boolean {
    return kind !== 'minutes' || !isRegion(city);
}

/** The word that opens the official name of each kind of authority. */
const OFFICIAL_NAME: Record<AuthorityType, { own: string; en: string }> = {
    municipality: { own: 'Δήμος', en: 'Municipality of' },
    region: { own: 'Περιφέρεια', en: 'Region of' },
};

/**
 * The official names that the city form proposes from the short name: "Δήμος
 * Χανιά", "Region of Thessalia". A proposal only: Greek puts the place in the
 * genitive ("Δήμος Χανίων"), so a person corrects it.
 */
export function proposedOfficialName(authorityType: AuthorityType, name: string): string {
    return `${OFFICIAL_NAME[authorityType].own} ${name}`;
}

export function proposedOfficialNameEn(authorityType: AuthorityType, latinName: string): string {
    return `${OFFICIAL_NAME[authorityType].en} ${latinName}`;
}
