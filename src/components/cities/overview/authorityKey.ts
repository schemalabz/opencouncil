/**
 * The variant of a message that names the authority. Greek and Serbian inflect
 * the noun with its article ("για τον δήμο", "για την περιφέρεια"), so each
 * message carries both forms and the city picks one.
 */
export function authorityKey(key: string, city: { authorityType: string }): string {
    return `${key}.${city.authorityType === 'region' ? 'region' : 'municipality'}`;
}
