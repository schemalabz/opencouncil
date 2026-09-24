import fs from 'fs';
import path from 'path';

const messagesDir = path.join(__dirname, '../../../messages');

function collectStrings(value: unknown, prefix: string, out: Array<[string, string]>): Array<[string, string]> {
    if (typeof value === 'string') out.push([prefix, value]);
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value)) collectStrings(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return out;
}

/**
 * Every string of one locale's catalogs as [key, text] pairs: `<locale>.json`
 * and each `<locale>/*.json` module. A key starts with its file's path, such
 * as `sr.json.City.consultations`, so a failure names the file to edit. The
 * glossary tests share it; Jest runs only `*.test.ts`, so this is no suite.
 */
export function loadLocaleStrings(locale: string): Array<[string, string]> {
    const files = [
        `${locale}.json`,
        ...fs
            .readdirSync(path.join(messagesDir, locale))
            .filter((f) => f.endsWith('.json'))
            .map((f) => path.join(locale, f)),
    ];
    return files.flatMap((f) => collectStrings(JSON.parse(fs.readFileSync(path.join(messagesDir, f), 'utf8')), f, []));
}
