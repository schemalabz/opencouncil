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
    const lowered = name
        .replace(/\s*\([^)]*\)\s*/g, ' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/ς/g, 'σ')
        .replace(/\s+/g, ' ')
        .trim();
    return /[α-ω]/.test(lowered) ? foldLatinLookalikes(lowered) : lowered;
}

/**
 * Latin letters that stand in for Greek ones in a Greek name. Text extracted
 * from a PDF, by OCR or by a model, carries them: "ΔΕΛΗS", "ΓΕRASΙΜΟΣ". Only
 * applied to a name that already contains Greek letters, so a Latin name is
 * left alone.
 */
const LATIN_TO_GREEK: Record<string, string> = {
    a: 'α', b: 'β', e: 'ε', z: 'ζ', h: 'η', i: 'ι', k: 'κ', m: 'μ', n: 'ν',
    o: 'ο', p: 'ρ', r: 'ρ', s: 'σ', t: 'τ', y: 'υ', x: 'χ',
};

function foldLatinLookalikes(lowered: string): string {
    return lowered.replace(/[a-z]/g, ch => LATIN_TO_GREEK[ch] ?? ch);
}

/**
 * Informal first names as they appear in our data, mapped to the formal form
 * the election results and Diavgeia decisions use. Keys and values are in the
 * normalized form (lowercase, no tonos, final sigma folded). Only forms with a
 * single formal counterpart are listed; "Τάκης" or "Σάκης" stay as they are.
 */
const FORMAL_FIRST_NAMES: Record<string, string> = {
    γιωργοσ: 'γεωργιοσ', γιαννησ: 'ιωαννησ', δημητρησ: 'δημητριοσ', μιμησ: 'δημητριοσ',
    μανωλησ: 'εμμανουηλ', βασιλησ: 'βασιλειοσ', νικοσ: 'νικολαοσ', νικολασ: 'νικολαοσ',
    κωστασ: 'κωνσταντινοσ', κωστησ: 'κωνσταντινοσ', ντινοσ: 'κωνσταντινοσ', μιχαλησ: 'μιχαηλ',
    αντωνησ: 'αντωνιοσ', φωτησ: 'φωτιοσ', σωτηρησ: 'σωτηριοσ', αναστασησ: 'αναστασιοσ', τασοσ: 'αναστασιοσ',
    γρηγορησ: 'γρηγοριοσ', θανασησ: 'αθανασιοσ', νασοσ: 'αθανασιοσ', λευτερησ: 'ελευθεριοσ',
    στελιοσ: 'στυλιανοσ', σπυροσ: 'σπυριδων', τρυφωνασ: 'τρυφων', αλεξησ: 'αλεξιοσ', αλεκοσ: 'αλεξανδροσ',
    θοδωρησ: 'θεοδωροσ', θοδωροσ: 'θεοδωροσ', χαρησ: 'χαραλαμποσ', μπαμπησ: 'χαραλαμποσ', πανοσ: 'παναγιωτησ',
    στρατοσ: 'ευστρατιοσ', βαγγελησ: 'ευαγγελοσ', κατερινα: 'αικατερινη', ρενα: 'ειρηνη', ντινα: 'κωνσταντινα',
    λενα: 'ελενη', βουλα: 'παρασκευη', χρηστοσ: 'χρηστοσ',
};

/** The same name with every informal first name replaced by its formal form. */
export function formalizeFirstNames(normalized: string): string {
    return normalized
        .split(/\s+/)
        .map(token => FORMAL_FIRST_NAMES[token] ?? token)
        .join(' ');
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

    // Our data often carries the informal first name (Γιώργος) where the
    // election results and Diavgeia carry the formal one (Γεώργιος). Both
    // sides get this key, so either spelling matches the other.
    const formalKey = buildSortKey(formalizeFirstNames(normalizeGreekName(name)));
    if (formalKey !== keys[0]) {
        keys.push(formalKey);
    }

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
