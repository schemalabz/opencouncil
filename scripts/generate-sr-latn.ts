/**
 * Generates the Serbian Latin (sr-Latn) message catalogs from the Serbian
 * Cyrillic (sr) ones: messages/sr.json → messages/sr-Latn.json and
 * messages/sr/*.json → messages/sr-Latn/*.json.
 *
 * The transform is the raw Cyrillic→Latin character map, whose domain is
 * exclusively Cyrillic code points — ICU MessageFormat syntax ({placeholders},
 * plural/select keywords, #, tags) is ASCII and provably untouched, while
 * Cyrillic literals inside nested plural branches convert correctly.
 *
 * The generated files are committed; a test regenerates them in memory and
 * fails when they are stale. Run via `npm run generate:sr-latn`.
 */
import fs from 'fs';
import path from 'path';
import { cyrillicToLatin } from '../src/lib/serbian/transliterate';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export function transliterateCatalog(value: Json): Json {
    if (typeof value === 'string') return cyrillicToLatin(value);
    if (Array.isArray(value)) return value.map(transliterateCatalog);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, transliterateCatalog(v)]));
    }
    return value;
}

export function generateSrLatnCatalogs(messagesDir: string): { written: string[] } {
    const written: string[] = [];
    const render = (value: Json) => `${JSON.stringify(value, null, 4)}\n`;

    const mainSource = path.join(messagesDir, 'sr.json');
    const mainTarget = path.join(messagesDir, 'sr-Latn.json');
    fs.writeFileSync(mainTarget, render(transliterateCatalog(JSON.parse(fs.readFileSync(mainSource, 'utf8')))));
    written.push(mainTarget);

    const modularDir = path.join(messagesDir, 'sr');
    const modularTargetDir = path.join(messagesDir, 'sr-Latn');
    fs.mkdirSync(modularTargetDir, { recursive: true });
    for (const file of fs.readdirSync(modularDir).filter((f) => f.endsWith('.json')).sort()) {
        const target = path.join(modularTargetDir, file);
        const source = JSON.parse(fs.readFileSync(path.join(modularDir, file), 'utf8'));
        fs.writeFileSync(target, render(transliterateCatalog(source)));
        written.push(target);
    }
    return { written };
}

if (require.main === module) {
    const { written } = generateSrLatnCatalogs(path.join(__dirname, '..', 'messages'));
    for (const file of written) console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
