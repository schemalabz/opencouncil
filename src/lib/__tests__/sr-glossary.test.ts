/**
 * Serbian terminology guard. Enforces the glossary decisions documented in
 * docs/guides/serbian-localization.md across messages/sr* so new strings don't
 * drift back into calques or inconsistent style. The native reviewer extends
 * BANNED/REQUIRED as their review settles more terms.
 */
import fs from 'fs';
import path from 'path';

const messagesDir = path.join(__dirname, '../../../messages');

const serbianFiles = [
    'sr.json',
    ...fs.readdirSync(path.join(messagesDir, 'sr')).map((f) => path.join('sr', f)),
];

const collectStrings = (value: unknown, prefix: string, out: Array<[string, string]>): Array<[string, string]> => {
    if (typeof value === 'string') out.push([prefix, value]);
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value)) collectStrings(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return out;
};

const allMessages: Array<[string, string]> = serbianFiles.flatMap((f) => {
    const data = JSON.parse(fs.readFileSync(path.join(messagesDir, f), 'utf8'));
    return collectStrings(data, f, []);
});

// Terms that must never appear, with the approved replacement.
const BANNED: Array<{ pattern: RegExp; use: string }> = [
    // English calque; the statutory term (Zakon o lokalnoj samoupravi) is јавна расправа.
    { pattern: /[Кк]онсултациј/, use: 'јавна расправа' },
];

// Load-bearing labels pinned to their approved stem (not exact strings, so the
// reviewer can rephrase without breaking the test).
const REQUIRED: Array<{ key: string; stem: RegExp }> = [
    { key: 'sr.json.City.consultations', stem: /расправ/ },
    { key: 'sr.json.CityForm.consultationsEnabled', stem: /расправ/ },
];

describe('Serbian glossary', () => {
    it('contains no banned terms', () => {
        const violations: string[] = [];
        for (const [key, msg] of allMessages) {
            for (const { pattern, use } of BANNED) {
                if (pattern.test(msg)) violations.push(`${key}: matches ${pattern} — use "${use}"`);
            }
        }
        expect(violations).toEqual([]);
    });

    it('uses lowercase formal pronouns mid-sentence (ви/вас/вам/ваш)', () => {
        // Capitalized В-pronouns are letter-style; web copy keeps them lowercase
        // except at the start of a string or sentence.
        const pronoun = /(?<![Ѐ-ӿ])В(ас|ам|аш[а-џ]*|и)(?![а-џ])/g;
        const violations: string[] = [];
        for (const [key, msg] of allMessages) {
            for (const m of msg.matchAll(pronoun)) {
                const before = msg.slice(0, m.index);
                const atSentenceStart = before === '' || /(^|[.!?…])\s*$/.test(before);
                if (!atSentenceStart) violations.push(`${key}: "…${msg.slice(Math.max(0, m.index! - 20), m.index! + 10)}…"`);
            }
        }
        expect(violations).toEqual([]);
    });

    it('keeps required stems in load-bearing labels', () => {
        const byKey = new Map(allMessages);
        for (const { key, stem } of REQUIRED) {
            const msg = byKey.get(key);
            if (msg === undefined) throw new Error(`missing key ${key}`);
            expect(`${key}: ${msg}`).toMatch(stem);
        }
    });
});
