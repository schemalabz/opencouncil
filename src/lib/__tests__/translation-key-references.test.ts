/**
 * Every message key the code asks for must exist in the catalogs.
 *
 * `translations.test.ts` checks the catalogs agree with each other; nothing
 * checked they agree with the code. A missing key does not throw — next-intl
 * logs to `console.error` and renders the dotted path as literal text — so a
 * `t('author')` with no `author` entry ships as "metadata.people.author" in the
 * page's author meta tag and nobody notices.
 *
 * Only the reference locale (`en`) is checked: the other catalogs are pinned to
 * it key-for-key by `translations.test.ts`, and sr-Latn is derived from sr.
 *
 * Static scan rather than a render: the keys are spread over ~200 components,
 * most of which need a request scope, a database or a map canvas to render.
 * Namespace bindings are resolved to the nearest *preceding* `useTranslations` /
 * `getTranslations` of the same variable name, so the common pattern of several
 * `const t = useTranslations(...)` in one file — one per component — resolves to
 * the right namespace instead of collapsing to whichever came last.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..');
const REFERENCE_LOCALE = 'en';

function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) sourceFiles(full, out);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
}

/** The merged catalog next-intl serves: `<locale>.json` plus every `<locale>/*.json` under its filename. */
function loadCatalog(locale: string): Record<string, unknown> {
    const messagesDir = path.join(ROOT, 'messages');
    const merged: Record<string, unknown> = JSON.parse(
        fs.readFileSync(path.join(messagesDir, `${locale}.json`), 'utf8'),
    );
    const localeDir = path.join(messagesDir, locale);
    for (const file of fs.readdirSync(localeDir)) {
        if (file.endsWith('.json')) {
            merged[file.replace(/\.json$/, '')] = JSON.parse(
                fs.readFileSync(path.join(localeDir, file), 'utf8'),
            );
        }
    }
    return merged;
}

function resolve(catalog: Record<string, unknown>, dotted: string): unknown {
    let node: unknown = catalog;
    for (const segment of dotted.split('.')) {
        if (typeof node !== 'object' || node === null) return undefined;
        if (!Object.prototype.hasOwnProperty.call(node, segment)) return undefined;
        node = (node as Record<string, unknown>)[segment];
    }
    return node;
}

/** Every leaf's dotted path, for prefix matching against computed keys. */
function flatten(node: unknown, prefix = ''): string[] {
    if (typeof node !== 'object' || node === null) return [prefix];
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
        flatten(v, prefix ? `${prefix}.${k}` : k),
    );
}

function hasKey(catalog: Record<string, unknown>, dotted: string): boolean {
    return resolve(catalog, dotted) !== undefined;
}

/**
 * Members of a string-literal union declared in source, e.g.
 * `export type AudioExportFailure = 'noAudio' | 'fetchFailed';`
 */
function unionMembers(file: string, typeName: string): string[] {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const decl = new RegExp(`type\\s+${typeName}\\s*=\\s*([^;]+);`).exec(text);
    if (!decl) throw new Error(`${typeName} not found in ${file} — update this test`);
    return [...decl[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

// `const t = useTranslations('ns')` / `const t = await getTranslations({ locale, namespace: 'ns' })`
const BINDING = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(([^;]{0,200}?)\)/g;
const NAMESPACE_ARG = /^\s*['"]([^'"]+)['"]|namespace:\s*['"]([^'"]+)['"]/;

type Reference = { location: string; key: string };

function collectReferences(): { refs: Reference[]; groups: Reference[]; skipped: number } {
    const refs: Reference[] = [];
    const groups: Reference[] = [];
    let skipped = 0;

    for (const file of sourceFiles(path.join(ROOT, 'src'))) {
        const text = fs.readFileSync(file, 'utf8');
        if (!text.includes('Translations')) continue;

        const bindings = [...text.matchAll(BINDING)].map((m) => {
            const ns = NAMESPACE_ARG.exec(m[2] ?? '');
            return { name: m[1], namespace: ns ? (ns[1] ?? ns[2]) : null, at: m.index! };
        });
        if (bindings.length === 0) continue;

        for (const name of new Set(bindings.map((b) => b.name))) {
            // t('key'), t.raw('key'), t.rich('key'), t.markup('key') — but not t.has('key'),
            // which is the deliberate "might not exist" escape hatch.
            const calls = new RegExp(
                `\\b${name}(?:\\.(?:raw|rich|markup))?\\s*\\(\\s*(['"\`])((?:[^'"\`\\\\]|\\\\.)*)\\1`,
                'g',
            );
            for (const call of text.matchAll(calls)) {
                const binding = bindings.filter((b) => b.name === name && b.at < call.index!).pop();
                // Root-namespace bindings (`useTranslations()`) take full paths we
                // can't attribute, and template literals are computed at runtime.
                if (!binding?.namespace) { skipped++; continue; }
                const key = call[2];
                if (key === '') { skipped++; continue; }
                const line = text.slice(0, call.index!).split('\n').length;
                const location = `${path.relative(ROOT, file)}:${line}`;
                const interpolated = key.indexOf('${');
                if (interpolated !== -1) {
                    // `t(`audioFailure.${reason}`)` — the leaf is only known at
                    // runtime, but the group it lives under is not. Checking the
                    // prefix catches the group being renamed or dropped wholesale,
                    // which is the failure a static scan can still see. Members are
                    // covered by the union checks below.
                    const prefix = key.slice(0, interpolated);
                    if (prefix) groups.push({ location, key: `${binding.namespace}.${prefix}` });
                    else skipped++;
                    continue;
                }
                refs.push({ location, key: `${binding.namespace}.${key}` });
            }
        }
    }
    return { refs, groups, skipped };
}

describe('message keys referenced by the code', () => {
    const { refs, groups, skipped } = collectReferences();
    const catalog = loadCatalog(REFERENCE_LOCALE);

    it('finds the call sites at all (guards the scan against silently matching nothing)', () => {
        expect(refs.length).toBeGreaterThan(1500);
        // A refactor that made most keys dynamic would hollow out the check above.
        expect(skipped).toBeLessThan(refs.length / 10);
    });

    it(`every key a t() call asks for exists in messages/${REFERENCE_LOCALE}`, () => {
        const missing = refs
            .filter((r) => !hasKey(catalog, r.key))
            .map((r) => `${r.key} (${r.location})`);
        expect([...new Set(missing)].sort()).toEqual([]);
    });

    it('every computed key has a prefix some real key starts with', () => {
        // Two shapes in use: a nested group (`audioFailure.${reason}`) and a flat
        // underscore family (`adminBodyType_${type}`). Matching the prefix against
        // flattened leaf paths covers both without assuming a separator.
        const leaves = flatten(catalog);
        const missing = groups
            .filter((g) => !leaves.some((leaf) => leaf.startsWith(g.key)))
            .map((g) => `${g.key}… (${g.location})`);
        expect([...new Set(missing)].sort()).toEqual([]);
    });

    /**
     * A computed key's leaf is invisible to the scan above, so the union that
     * supplies it is checked against the catalog directly. Adding a member
     * without its copy fails here rather than rendering the dotted path in a
     * toast. New computed groups belong in this table.
     */
    describe.each([
        {
            group: 'admin.adminActions.export.audioFailure',
            file: 'src/lib/export/meetings.tsx',
            type: 'AudioExportFailure',
        },
    ])('$type supplies every leaf under $group', ({ group, file, type }) => {
        it('has copy for every member', () => {
            const node = resolve(catalog, group);
            expect(typeof node).toBe('object');
            const defined = Object.keys(node as Record<string, unknown>).sort();
            expect(defined).toEqual(unionMembers(file, type).sort());
        });
    });
});
