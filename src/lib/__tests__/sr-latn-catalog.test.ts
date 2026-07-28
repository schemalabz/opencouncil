/**
 * Guards the generated Serbian Latin catalogs:
 * 1. Staleness — messages/sr-Latn* must equal an in-memory regeneration from
 *    messages/sr*; when this fails, run `npm run generate:sr-latn`.
 * 2. ICU invariance — the sr → sr-Latn transform must never touch ICU
 *    MessageFormat syntax, only Cyrillic literals.
 * 3. ICU validity — every Serbian message must parse as ICU MessageFormat and
 *    use exactly the argument set of its English counterpart.
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { transliterateCatalog } from '../../../scripts/generate-sr-latn';

const messagesDir = path.join(__dirname, '../../../messages');

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

const modularFiles = fs
    .readdirSync(path.join(messagesDir, 'sr'))
    .filter((f) => f.endsWith('.json'))
    .sort();

describe('sr-Latn generated catalogs', () => {
    it('messages/sr-Latn.json is up to date (else run npm run generate:sr-latn)', () => {
        expect(readJson(path.join(messagesDir, 'sr-Latn.json'))).toEqual(
            transliterateCatalog(readJson(path.join(messagesDir, 'sr.json'))),
        );
    });

    it.each(modularFiles)('messages/sr-Latn/%s is up to date (else run npm run generate:sr-latn)', (file) => {
        expect(readJson(path.join(messagesDir, 'sr-Latn', file))).toEqual(
            transliterateCatalog(readJson(path.join(messagesDir, 'sr', file))),
        );
    });

    it('generates no orphan files (every sr-Latn file has an sr source)', () => {
        const generated = fs
            .readdirSync(path.join(messagesDir, 'sr-Latn'))
            .filter((f) => f.endsWith('.json'))
            .sort();
        expect(generated).toEqual(modularFiles);
    });

    it('the transform preserves ICU syntax characters in every message', () => {
        const collect = (value: unknown, out: string[]): string[] => {
            if (typeof value === 'string') out.push(value);
            else if (Array.isArray(value)) value.forEach((v) => collect(v, out));
            else if (value && typeof value === 'object') Object.values(value).forEach((v) => collect(v, out));
            return out;
        };
        const sources = collect(readJson(path.join(messagesDir, 'sr.json')), []);
        for (const file of modularFiles) collect(readJson(path.join(messagesDir, 'sr', file)), sources);

        const syntaxCount = (s: string) => (s.match(/[{}#<>]/g) ?? []).length;
        for (const source of sources) {
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
