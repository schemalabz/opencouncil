/**
 * Shared Greek name normalization and token-sort matching utilities.
 *
 * Used by scripts that need to match Greek names from external sources
 * (election data, Diavgeia documents) to database Person records.
 */

/**
 * Normalize a Greek name for matching: strip diacritics (tonos), remove
 * parenthetical nicknames like "(ΜΠΑΜΠΗΣ)", collapse whitespace, lowercase.
 */
export function normalizeGreekName(name: string): string {
    return name
        .replace(/\s*\([^)]*\)\s*/g, ' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/ς/g, 'σ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Build a sorted token key from a normalized name string. */
export function buildSortKey(normalized: string): string {
    return normalized
        .replace(/[-–—]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .sort()
        .join(' ');
}

/**
 * Generate token-sort keys for a name. Returns multiple keys when the name
 * contains a parenthetical nickname like "(ΚΩΣΤΗΣ)": one key with the nickname
 * stripped and one with the nickname replacing the preceding name part.
 */
export function tokenSortKeys(name: string): string[] {
    const keys: string[] = [];

    keys.push(buildSortKey(normalizeGreekName(name)));

    const nicknameMatch = name.match(/(\S+)\s*\(([^)]+)\)/);
    if (nicknameMatch) {
        const replaced = name
            .replace(/\S+\s*\([^)]+\)/, nicknameMatch[2]);
        const nicknameKey = buildSortKey(normalizeGreekName(replaced));
        if (nicknameKey !== keys[0]) {
            keys.push(nicknameKey);
        }
    }

    // Handle names with multiple parenthetical nicknames
    const allNicknameMatches = [...name.matchAll(/\S+\s*\(([^)]+)\)/g)];
    if (allNicknameMatches.length > 1) {
        let allReplaced = name;
        for (const m of allNicknameMatches) {
            allReplaced = allReplaced.replace(m[0], m[1]);
        }
        const allNicknameKey = buildSortKey(normalizeGreekName(allReplaced));
        if (!keys.includes(allNicknameKey)) {
            keys.push(allNicknameKey);
        }
    }

    return keys;
}

export interface MatchCandidate {
    name: string;
    index: number;
}

export interface DbMember {
    id: string;
    name: string;
}

/**
 * Match a list of candidates (from external data) to database members by name.
 * Returns a map from dbMember.id to the matched candidate index.
 */
export function matchByName(
    candidates: MatchCandidate[],
    dbMembers: DbMember[],
): { matched: Map<string, number>; unmatched: string[] } {
    const matched = new Map<string, number>();
    const usedCandidates = new Set<number>();

    // Build lookup: token-sort key → candidate index
    const candidateLookup = new Map<string, number>();
    for (const c of candidates) {
        for (const key of tokenSortKeys(c.name)) {
            if (!candidateLookup.has(key)) {
                candidateLookup.set(key, c.index);
            }
        }
    }

    for (const m of dbMembers) {
        const keys = tokenSortKeys(m.name);
        let matchIdx: number | undefined;
        for (const k of keys) {
            const idx = candidateLookup.get(k);
            if (idx !== undefined && !usedCandidates.has(idx)) {
                matchIdx = idx;
                break;
            }
        }
        if (matchIdx !== undefined) {
            matched.set(m.id, matchIdx);
            usedCandidates.add(matchIdx);
        }
    }

    const unmatched = dbMembers
        .filter(m => !matched.has(m.id))
        .map(m => m.name);

    return { matched, unmatched };
}
