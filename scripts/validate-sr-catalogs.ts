/**
 * Validates the Serbian message catalogs against the English source:
 * every message in messages/sr*, both scripts, must (a) parse as ICU
 * MessageFormat and (b) use exactly the argument set of its English
 * counterpart — the two failure modes machine translation can introduce that
 * key-parity checks can't see. Exits non-zero with a per-message report.
 *
 * Run directly (`npx tsx scripts/validate-sr-catalogs.ts`) or via the jest
 * wrapper in src/lib/__tests__/sr-latn-catalog.test.ts (the parser is
 * ESM-only, which jest's CJS sandbox can't import — tsx can).
 */
import fs from 'fs';
import path from 'path';
import { parse, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';

const messagesDir = path.join(__dirname, '..', 'messages');

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

function flatten(value: unknown, prefix: string, out: Map<string, string>): Map<string, string> {
    if (typeof value === 'string') out.set(prefix, value);
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return out;
}

function argsOf(ast: MessageFormatElement[], set = new Set<string>()): Set<string> {
    for (const el of ast) {
        if ('value' in el && el.type !== 0 && typeof el.value === 'string') set.add(el.value);
        if ('options' in el && el.options) {
            for (const opt of Object.values(el.options)) argsOf(opt.value, set);
        }
        if ('children' in el && el.children) argsOf(el.children, set);
    }
    return set;
}

const modularFiles = fs
    .readdirSync(path.join(messagesDir, 'sr'))
    .filter((f) => f.endsWith('.json'))
    .sort();

const filePairs: Array<[string, string]> = [
    ['en.json', 'sr.json'],
    ['en.json', 'sr-Latn.json'],
    ...modularFiles.flatMap((f): Array<[string, string]> => [
        [path.join('en', f), path.join('sr', f)],
        [path.join('en', f), path.join('sr-Latn', f)],
    ]),
];

const errors: string[] = [];
let checked = 0;

for (const [enFile, srFile] of filePairs) {
    const en = flatten(readJson(path.join(messagesDir, enFile)), '', new Map());
    const sr = flatten(readJson(path.join(messagesDir, srFile)), '', new Map());
    for (const [key, msg] of sr) {
        checked++;
        let srAst: MessageFormatElement[];
        try {
            srAst = parse(msg, { requiresOtherClause: false });
        } catch (e) {
            errors.push(`${srFile} → ${key}: invalid ICU — ${(e as Error).message}`);
            continue;
        }
        const enMsg = en.get(key);
        if (enMsg === undefined) continue; // key parity is covered by translations.test.ts
        const enArgs = [...argsOf(parse(enMsg, { requiresOtherClause: false }))].sort().join(',');
        const srArgs = [...argsOf(srAst)].sort().join(',');
        if (enArgs !== srArgs) {
            errors.push(`${srFile} → ${key}: arguments [${srArgs}] != en [${enArgs}]`);
        }
    }
}

if (errors.length > 0) {
    console.error(errors.join('\n'));
    console.error(`\n${errors.length} problem(s) in ${checked} messages`);
    process.exit(1);
}
console.log(`OK: ${checked} Serbian messages parse as ICU and match English argument sets`);
