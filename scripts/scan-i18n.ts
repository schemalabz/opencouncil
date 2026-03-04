import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * i18n Validator (Parity + Source Scan + TODO Detection).
 * Performs:
 * 1. Recursive dot-notation parity check between el.json and en.json.
 * 2. Full source scan for useTranslations/getTranslations namespaces.
 * 3. Detects [TODO:] placeholders left by sync script.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, '../messages');
const elPath = path.join(messagesDir, 'el.json');
const enPath = path.join(messagesDir, 'en.json');

if (!fs.existsSync(elPath) || !fs.existsSync(enPath)) {
    console.error('Translation files not found.');
    process.exit(1);
}

function loadWithModular(jsonPath: string): Record<string, unknown> {
    let data: Record<string, unknown>;
    try {
        data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch (err) {
        console.error(`Failed to parse ${path.relative(process.cwd(), jsonPath)}: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
    }

    const localeDir = jsonPath.replace('.json', '');
    if (fs.existsSync(localeDir)) {
        fs.readdirSync(localeDir).forEach(file => {
            if (file.endsWith('.json')) {
                const moduleName = file.replace('.json', '');
                try {
                    data[moduleName] = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
                } catch (err) {
                    console.error(`Failed to parse ${path.relative(process.cwd(), path.join(localeDir, file))}: ${err instanceof Error ? err.message : err}`);
                    process.exit(1);
                }
            }
        });
    }
    return data;
}

const elData = loadWithModular(elPath);
const enData = loadWithModular(enPath);

function resolvePath(obj: Record<string, unknown>, pathStr: string): unknown {
    return pathStr.split('.').reduce<unknown>((acc, part) => {
        if (acc && typeof acc === 'object' && !Array.isArray(acc)) {
            return (acc as Record<string, unknown>)[part];
        }
        return undefined;
    }, obj);
}

function flatten(obj: Record<string, unknown>, prefix = '', res: Record<string, boolean> = {}): Record<string, boolean> {
    for (const key in obj) {
        const propName = prefix ? `${prefix}.${key}` : key;
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            flatten(obj[key] as Record<string, unknown>, propName, res);
        } else {
            res[propName] = true;
        }
    }
    return res;
}

// 1. Parity Check
const elKeys = flatten(elData);
const enKeys = flatten(enData);

const missingInEn = Object.keys(elKeys).filter(k => !enKeys[k]);
const missingInEl = Object.keys(enKeys).filter(k => !elKeys[k]);

let failed = false;

if (missingInEn.length > 0 || missingInEl.length > 0) {
    console.error('\x1b[31m%s\x1b[0m', 'i18n Parity Check Failed!');
    if (missingInEn.length > 0) console.error('Missing in en.json:\n  - ' + missingInEn.slice(0, 5).join('\n  - ') + (missingInEn.length > 5 ? `\n  - ... and ${missingInEn.length - 5} more` : ''));
    if (missingInEl.length > 0) console.error('Missing in el.json:\n  - ' + missingInEl.slice(0, 5).join('\n  - ') + (missingInEl.length > 5 ? `\n  - ... and ${missingInEl.length - 5} more` : ''));
    failed = true;
} else {
    console.log('\x1b[32m%s\x1b[0m', 'i18n Parity Check Passed.');
}

// 2. Source Scan
const translationRegex = /(?:useTranslations|getTranslations)\(\s*(['"])(.*?)\1\s*\)/g;

interface MissingNamespace {
    file: string;
    namespace: string;
}

const missingNamespaces: MissingNamespace[] = [];

function walk(dir: string, callback: (filePath: string) => void): void {
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.lstatSync(fullPath).isDirectory()) {
            walk(fullPath, callback);
        } else {
            callback(fullPath);
        }
    });
}

const srcDir = path.join(__dirname, '../src');
walk(srcDir, (file) => {
    if (!file.endsWith('.ts') && !file.endsWith('.tsx')) return;
    if (file.includes('.test.') || file.includes('.spec.') || file.includes('__tests__')) return;

    const rawContent = fs.readFileSync(file, 'utf8');
    const content = rawContent
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    let match: RegExpExecArray | null;
    translationRegex.lastIndex = 0;
    while ((match = translationRegex.exec(content)) !== null) {
        const namespace = match[2];
        if (namespace.includes('{') || namespace.includes('$')) continue;
        if (!resolvePath(elData, namespace)) {
            missingNamespaces.push({ file: path.relative(process.cwd(), file), namespace });
        }
    }
});

if (missingNamespaces.length > 0) {
    console.error('\x1b[31m%s\x1b[0m', 'i18n Source Scan Failed!');
    missingNamespaces.forEach(m => {
        console.error(`Namespace "${m.namespace}" used in ${m.file} is missing from el.json`);
    });
    failed = true;
} else {
    console.log('\x1b[32m%s\x1b[0m', 'i18n Source Scan Passed.');
}

// 3. TODO Detection
function findTodos(obj: Record<string, unknown>, prefix = '', results: string[] = []): string[] {
    for (const key in obj) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            findTodos(value as Record<string, unknown>, fullKey, results);
        } else if (typeof value === 'string' && value.startsWith('[TODO:')) {
            results.push(fullKey);
        }
    }
    return results;
}

const locales: Array<{ name: string; data: Record<string, unknown> }> = [
    { name: 'el', data: elData },
    { name: 'en', data: enData },
];

for (const locale of locales) {
    const todos = findTodos(locale.data);
    if (todos.length > 0) {
        console.error('\x1b[31m%s\x1b[0m', `Found ${todos.length} TODO placeholder(s) in ${locale.name}.json:`);
        console.error('  - ' + todos.slice(0, 5).join('\n  - ') + (todos.length > 5 ? `\n  - ... and ${todos.length - 5} more` : ''));
        failed = true;
    }
}

if (failed) {
    console.error('\nRun "tsx scripts/sync-i18n.ts" to sync JSON keys or update translations.');
    process.exit(1);
}

process.exit(0);
