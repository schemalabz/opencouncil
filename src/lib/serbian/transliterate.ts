import { EXCEPTION_STEMS, PROTECTED_WORDS } from './exceptions';

/**
 * Serbian dual-script (Cyrillic ↔ Latin) transliteration.
 *
 * Pure module: no server or React dependencies, so it is usable from client
 * components, the proxy, build scripts and tests alike.
 *
 * Direction asymmetry, by design:
 * - Cyrillic→Latin is a deterministic character map whose domain is exclusively
 *   Serbian Cyrillic code points. Everything else (Greek, Latin, digits, ICU
 *   or markdown syntax) passes through untouched, so it is safe on any input.
 * - Latin→Cyrillic is word-tokenized: the digraphs lj/nj/dž are single letters
 *   in most words (љ/њ/џ) but two letters in others (инјекција, надживети),
 *   and foreign words must not be converted at all. Tokens containing
 *   non-Serbian Latin letters (q, w, x, y, accented vowels), protected brand
 *   words, URLs and emails are left unchanged.
 */

const CYR_TO_LAT: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z',
    и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', ћ: 'ć', у: 'u', ф: 'f', х: 'h', ц: 'c',
    ч: 'č', џ: 'dž', ш: 'š',
    А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Ђ: 'Đ', Е: 'E', Ж: 'Ž', З: 'Z',
    И: 'I', Ј: 'J', К: 'K', Л: 'L', Љ: 'Lj', М: 'M', Н: 'N', Њ: 'Nj', О: 'O',
    П: 'P', Р: 'R', С: 'S', Т: 'T', Ћ: 'Ć', У: 'U', Ф: 'F', Х: 'H', Ц: 'C',
    Ч: 'Č', Џ: 'Dž', Ш: 'Š',
};

const LAT_TO_CYR: Record<string, string> = {
    a: 'а', b: 'б', c: 'ц', č: 'ч', ć: 'ћ', d: 'д', đ: 'ђ', e: 'е', f: 'ф',
    g: 'г', h: 'х', i: 'и', j: 'ј', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о',
    p: 'п', r: 'р', s: 'с', š: 'ш', t: 'т', u: 'у', v: 'в', z: 'з', ž: 'ж',
    A: 'А', B: 'Б', C: 'Ц', Č: 'Ч', Ć: 'Ћ', D: 'Д', Đ: 'Ђ', E: 'Е', F: 'Ф',
    G: 'Г', H: 'Х', I: 'И', J: 'Ј', K: 'К', L: 'Л', M: 'М', N: 'Н', O: 'О',
    P: 'П', R: 'Р', S: 'С', Š: 'Ш', T: 'Т', U: 'У', V: 'В', Z: 'З', Ž: 'Ж',
};

function isUppercaseLetter(ch: string | undefined): boolean {
    return !!ch && ch === ch.toUpperCase() && ch !== ch.toLowerCase();
}

function isLetter(ch: string | undefined): boolean {
    return !!ch && ch.toLowerCase() !== ch.toUpperCase();
}

/**
 * Cyrillic → Latin. Character-level and fully deterministic; non-Cyrillic
 * characters pass through, so mixed and non-Serbian text is unaffected.
 * Uppercase digraph letters (Љ/Њ/Џ) map to LJ/NJ/DŽ when a neighboring letter
 * is uppercase (ЉУБЉАНА → LJUBLJANA), otherwise to Lj/Nj/Dž (Љубљана →
 * Ljubljana).
 */
export function cyrillicToLatin(text: string): string {
    let out = '';
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const mapped = CYR_TO_LAT[ch];
        if (mapped === undefined) {
            out += ch;
            continue;
        }
        if (mapped.length === 2 && isUppercaseLetter(ch)) {
            // Case the digraph from the next letter; at the END of a word
            // (next char missing or not a letter — space, punctuation, digit),
            // fall back to the nearest preceding letter, so КОЊ! → KONJ! and
            // МОДЕЛ-Џ5 → MODEL-DŽ5, while a standalone Џ. stays Dž.
            let neighbor = text[i + 1];
            if (!isLetter(neighbor)) {
                let j = i - 1;
                while (j >= 0 && !isLetter(text[j])) j--;
                neighbor = text[j];
            }
            out += isUppercaseLetter(neighbor) ? mapped.toUpperCase() : mapped;
        } else {
            out += mapped;
        }
    }
    return out;
}

// Matches URLs and email addresses, which must stay byte-identical: a
// transliterated link target points nowhere.
const OPAQUE_SPAN = /((?:https?:\/\/|www\.)\S+|[^\s@]+@[^\s@]+\.[^\s@]+)/g;

const LETTER_RUN = /\p{L}+/gu;

function convertLatinToken(token: string): string {
    const lower = token.toLowerCase();
    if (PROTECTED_WORDS.has(lower)) return token;
    for (const ch of token) {
        // Any letter outside the Serbian Latin alphabet (q/w/x/y, accented or
        // Greek/Cyrillic letters) marks the token as not-Serbian-Latin: leave
        // it untouched. This is also what keeps already-Cyrillic text intact.
        if (LAT_TO_CYR[ch] === undefined) return token;
    }

    let out = '';
    let i = 0;

    // Exception stems are words whose lj/nj/dž sequences are two separate
    // letters — convert the stem strictly character-by-character.
    const stem = EXCEPTION_STEMS.find((s) => lower.startsWith(s));
    if (stem) {
        for (; i < stem.length; i++) out += LAT_TO_CYR[token[i]];
    }

    while (i < token.length) {
        const pair = token.slice(i, i + 2).toLowerCase();
        if (pair === 'lj' || pair === 'nj' || pair === 'dž') {
            const upper = isUppercaseLetter(token[i]);
            out += pair === 'lj' ? (upper ? 'Љ' : 'љ') : pair === 'nj' ? (upper ? 'Њ' : 'њ') : upper ? 'Џ' : 'џ';
            i += 2;
            continue;
        }
        out += LAT_TO_CYR[token[i]];
        i++;
    }
    return out;
}

/**
 * Latin → Cyrillic. Word-tokenized with digraph handling (lj→љ, nj→њ, dž→џ),
 * a prefix-based exception dictionary for words where those sequences are two
 * letters, and skip rules for foreign words, URLs and emails. `dj` is never
 * fused to ђ (одједном would break); only the literal đ maps to ђ.
 */
export function latinToCyrillic(text: string): string {
    // NFC first: in decomposed text (e.g. macOS paste), combining accents are
    // separate code points, so "café" would tokenize as the all-Serbian-valid
    // "cafe" and get converted with an orphaned accent left behind.
    return text
        .normalize('NFC')
        .split(OPAQUE_SPAN)
        .map((part, idx) => (idx % 2 === 1 ? part : part.replace(LETTER_RUN, convertLatinToken)))
        .join('');
}

export type SerbianScript = 'cyrl' | 'latn';

/** Type guard for untrusted script identifiers (cookies, query params). */
export function isSerbianScript(value: string | null | undefined): value is SerbianScript {
    return value === 'cyrl' || value === 'latn';
}

/**
 * Transliterates Serbian text to the target script; text already in the target
 * script — and any non-Serbian text — comes back unchanged.
 */
export function toScript(text: string, target: SerbianScript): string {
    return target === 'latn' ? cyrillicToLatin(text) : latinToCyrillic(text);
}
