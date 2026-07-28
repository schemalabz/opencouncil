import fs from 'fs';
import path from 'path';

function getAllKeys(obj: object, prefix = ''): string[] {
    return Object.entries(obj).flatMap(([k, v]) => {
        const full = prefix ? `${prefix}.${k}` : k;
        return typeof v === 'object' && v !== null
            ? [full, ...getAllKeys(v as object, full)]
            : [full];
    });
}

const messagesDir = path.join(__dirname, '..', '..', '..', 'messages');

// en is the reference; every other shipped locale must mirror its key set exactly.
// sr-Latn is generated from sr and checked by sr-latn-catalog.test.ts instead.
const REFERENCE = 'en';
const LOCALES = ['el', 'fr', 'sr'];

function getModularFiles(): string[] {
    const files = [REFERENCE, ...LOCALES].flatMap((locale) => {
        const dir = path.join(messagesDir, locale);
        return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')) : [];
    });
    return [...new Set(files)].sort();
}

function loadJson(filePath: string): object {
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : {};
}

function expectMatchingKeys(reference: object, other: object) {
    const refKeys = new Set(getAllKeys(reference));
    const otherKeys = new Set(getAllKeys(other));
    expect([...otherKeys].filter(k => !refKeys.has(k))).toEqual([]);
    expect([...refKeys].filter(k => !otherKeys.has(k))).toEqual([]);
}

describe('translations sync', () => {
    it.each(LOCALES)('%s.json should mirror en.json (bidirectional, deep)', (locale) => {
        expectMatchingKeys(
            loadJson(path.join(messagesDir, `${REFERENCE}.json`)),
            loadJson(path.join(messagesDir, `${locale}.json`)),
        );
    });

    const cases = getModularFiles().flatMap((file) => LOCALES.map((locale) => [locale, file] as const));

    it.each(cases)('%s/%s should mirror en (bidirectional, deep)', (locale, file) => {
        expectMatchingKeys(
            loadJson(path.join(messagesDir, REFERENCE, file)),
            loadJson(path.join(messagesDir, locale, file)),
        );
    });
});
