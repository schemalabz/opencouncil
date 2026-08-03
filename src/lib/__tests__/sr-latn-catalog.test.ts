/**
 * Guards the load-time sr-Latn catalog derivation (there are no sr-Latn files
 * on disk — src/i18n/request.ts derives them from messages/sr* via
 * `transliterateCatalog`):
 * 1. Structure — the transform transliterates every string value and touches
 *    nothing else (keys, nesting, non-string values).
 * 2. Completeness — no Serbian Cyrillic survives derivation of the real corpus.
 * 3. ICU invariance — the transform never touches ICU MessageFormat syntax.
 * 4. ICU validity — every Serbian source message parses as ICU MessageFormat
 *    and uses exactly the argument set of its English counterpart.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { transliterateCatalog } from '../serbian/catalog';

const messagesDir = path.join(__dirname, '../../../messages');

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

const modularFiles = fs
    .readdirSync(path.join(messagesDir, 'sr'))
    .filter((f) => f.endsWith('.json'))
    .sort();

const collectStrings = (value: unknown, out: string[]): string[] => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
    else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out));
    return out;
};

const loadCorpus = (): string[] => {
    const sources = collectStrings(readJson(path.join(messagesDir, 'sr.json')), []);
    for (const file of modularFiles) collectStrings(readJson(path.join(messagesDir, 'sr', file)), sources);
    return sources;
};

describe('sr-Latn catalog derivation', () => {
    it('transliterates string values and preserves keys, nesting and non-strings', () => {
        expect(
            transliterateCatalog({
                'Наслов': 'Добродошли',
                nested: { count: '{count, plural, one {# глас} few {# гласа} other {# гласова}}' },
                untouched: [42, true, null],
            }),
        ).toEqual({
            'Наслов': 'Dobrodošli',
            nested: { count: '{count, plural, one {# glas} few {# glasa} other {# glasova}}' },
            untouched: [42, true, null],
        });
    });

    it('leaves no Serbian Cyrillic in the derived corpus', () => {
        const corpus = loadCorpus();
        expect(corpus.length).toBeGreaterThan(1000); // vacuity guard
        const serbianCyrillic = /[а-шђћџљњА-ШЂЋЏЉЊ]/u;
        for (const source of corpus) {
            expect(transliterateCatalog(source)).not.toMatch(serbianCyrillic);
        }
    });

    it('preserves ICU syntax characters in every message', () => {
        const syntaxCount = (s: string) => (s.match(/[{}#<>]/g) ?? []).length;
        for (const source of loadCorpus()) {
            const out = transliterateCatalog(source) as string;
            expect(syntaxCount(out)).toBe(syntaxCount(source));
        }
    });

    it('every Serbian message parses as ICU and matches the English argument set', () => {
        // Delegated to a tsx-run script: @formatjs/icu-messageformat-parser is
        // ESM-only, which jest's CJS sandbox can't import. Throws with the
        // script's per-message report on failure.
        execFileSync('npx', ['tsx', 'scripts/validate-sr-catalogs.ts'], {
            cwd: path.join(__dirname, '..', '..', '..'),
            stdio: 'pipe',
        });
    }, 30000);
});
