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
 * the right namespace instead of collapsing to whichever came last. A name bound
 * only once in a file resolves wherever it is called, which reaches the helpers
 * and sub-components that take the translator as a parameter and are declared
 * above the binding that feeds them.
 *
 * A shared helper that takes the translator as its `t` parameter has no binding
 * at all. It declares the namespace its callers must supply with a
 * `@translationNamespace <ns...>` JSDoc tag, which the scan reads as a binding
 * of `t`. The tag states a contract against the catalog; nothing here checks
 * that the callers honour it.
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

/** Members of an enum declared in `prisma/schema.prisma`. */
function prismaEnumMembers(name: string): string[] {
    const text = fs.readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
    const decl = new RegExp(`enum\\s+${name}\\s*\\{([^}]*)\\}`).exec(text);
    if (!decl) throw new Error(`enum ${name} not found in prisma/schema.prisma — update this test`);
    return decl[1]
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, '').trim())
        .filter(Boolean);
}

/**
 * The member names a computed group defines, for a group prefix that ends in
 * either a dot (`audioFailure.`) or an underscore (`adminBodyType_`). Anything
 * below the member — `clients.<id>.title` — belongs to the member, not to it.
 */
function memberLeaves(catalog: Record<string, unknown>, group: string): string[] {
    const members = flatten(catalog)
        .filter((leaf) => leaf.startsWith(group))
        .map((leaf) => leaf.slice(group.length).split('.')[0]);
    return [...new Set(members)];
}

// `const t = useTranslations('ns')` / `const t = await getTranslations({ locale, namespace: 'ns' })`
const BINDING = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(([^;]{0,200}?)\)/g;
const NAMESPACE_ARG = /^\s*['"]([^'"]+)['"]|namespace:\s*['"]([^'"]+)['"]/;

// `const [t, tAccount] = await Promise.all([getTranslations('A'), getTranslations('B')])`
// — the server pages bind several translators at once, and the names sit in the
// array pattern rather than next to the call that supplies them.
const DESTRUCTURED = /(?:const|let)\s*\[([^\]]*)\]\s*=\s*await\s+Promise\.all\(\s*\[([\s\S]{0,800}?)\]\s*\)/g;
const TRANSLATOR_CALL = /^(?:await\s+)?(?:useTranslations|getTranslations)\s*\(([\s\S]*)\)$/;

// `@translationNamespace Subject` on a helper that takes the translator as its
// `t` parameter. The helper has no binding of its own, so the tag is the only
// statement of the namespace its callers must supply.
//
// A tag may name several namespaces, and then the key has to exist under every
// one of them. No tag needs that today, and one needing it is worth a second
// look: it says one string is being kept in two places because two callers
// scope the same helper differently. `formatDateRange` read that way until its
// copy moved to `Common`.
const ANNOTATION = /@translationNamespace[ \t]+([A-Za-z0-9_.][A-Za-z0-9_. \t]*)/g;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Split on commas that are not inside brackets, so nested calls stay whole. */
function splitTopLevel(source: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < source.length; i++) {
        const c = source[i];
        if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) depth--;
        else if (c === ',' && depth === 0) {
            parts.push(source.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(source.slice(start));
    return parts.map((part) => part.trim());
}

type Reference = { location: string; key: string };

function collectReferences(): { refs: Reference[]; groups: Reference[]; skipped: number } {
    const refs: Reference[] = [];
    const groups: Reference[] = [];
    let skipped = 0;

    for (const file of sourceFiles(path.join(ROOT, 'src'))) {
        const text = fs.readFileSync(file, 'utf8');
        if (!text.includes('Translations') && !text.includes('@translationNamespace')) continue;

        const bindings = [...text.matchAll(BINDING)].map((m) => {
            const ns = NAMESPACE_ARG.exec(m[2] ?? '');
            const namespace = ns ? (ns[1] ?? ns[2]) : null;
            return { name: m[1], namespaces: namespace ? [namespace] : [], at: m.index! };
        });
        for (const annotation of text.matchAll(ANNOTATION)) {
            bindings.push({ name: 't', namespaces: annotation[1].trim().split(/[ \t]+/), at: annotation.index! });
        }
        for (const destructuring of text.matchAll(DESTRUCTURED)) {
            const names = splitTopLevel(destructuring[1]);
            splitTopLevel(destructuring[2]).forEach((element, i) => {
                const call = TRANSLATOR_CALL.exec(element);
                const name = names[i];
                if (!call || !name || !IDENTIFIER.test(name)) return;
                const ns = NAMESPACE_ARG.exec(call[1]);
                const namespace = ns ? (ns[1] ?? ns[2]) : null;
                bindings.push({ name, namespaces: namespace ? [namespace] : [], at: destructuring.index! });
            });
        }
        if (bindings.length === 0) continue;
        bindings.sort((a, b) => a.at - b.at);

        for (const name of new Set(bindings.map((b) => b.name))) {
            const own = bindings.filter((b) => b.name === name);
            // t('key'), t.raw('key'), t.rich('key'), t.markup('key') — but not t.has('key'),
            // which is the deliberate "might not exist" escape hatch.
            const calls = new RegExp(
                `\\b${name}(?:\\.(?:raw|rich|markup))?\\s*\\(\\s*(['"\`])((?:[^'"\`\\\\]|\\\\.)*)\\1`,
                'g',
            );
            for (const call of text.matchAll(calls)) {
                // Nearest preceding binding, so several components in one file each
                // resolve to their own namespace. When the name is bound exactly once,
                // position stops carrying information: helpers and sub-components that
                // take the translator as a parameter are declared above the single
                // binding that feeds them.
                const binding =
                    own.filter((b) => b.at < call.index!).pop() ?? (own.length === 1 ? own[0] : null);
                // A namespace assembled at runtime leaves nothing to resolve against.
                if (!binding?.namespaces.length) { skipped++; continue; }
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
                    if (prefix) for (const ns of binding.namespaces) groups.push({ location, key: `${ns}.${prefix}` });
                    else skipped++;
                    continue;
                }
                for (const ns of binding.namespaces) refs.push({ location, key: `${ns}.${key}` });
            }
        }
    }
    return { refs, groups, skipped };
}

type MemberSource = { file?: string; type?: string; prismaEnum?: string };

/**
 * Every computed group the scan finds. `members` names the type that supplies
 * the leaves, so a member added without its copy fails the test instead of
 * rendering a dotted path. `why` records the groups where no type states the
 * set, so the omission is a decision on the record rather than an oversight.
 */
const COMPUTED_GROUPS: { group: string; members?: MemberSource; why?: string }[] = [
    {
        group: 'admin.adminActions.export.audioFailure.',
        members: { file: 'src/lib/export/meetings.tsx', type: 'AudioExportFailure' },
    },
    {
        group: 'CityForm.boundaryError_',
        members: { file: 'src/lib/utils/geojson.ts', type: 'BoundaryParseError' },
    },
    { group: 'Common.adminBodyType_', members: { prismaEnum: 'AdministrativeBodyType' } },
    { group: 'AddMeetingForm.administrativeBodyType.', members: { prismaEnum: 'AdministrativeBodyType' } },
    { group: 'AdministrativeBodiesList.types.', members: { prismaEnum: 'AdministrativeBodyType' } },

    {
        group: 'Subject.categories.',
        why: 'every member is also written as a literal key in the same file, so the key check covers them',
    },
    {
        group: 'Subject.topicImportance.',
        why: 'the column is a plain String? in the Prisma schema; the values live in a comment',
    },
    {
        group: 'Subject.proximityImportance.',
        why: 'the column is a plain String? in the Prisma schema; the values live in a comment',
    },
    { group: 'Onboarding.errors.', why: 'the error reaches the component as string | null; no type states the set' },
    { group: 'Profile.admin', why: 'the leaf is an object key (city/party/person) capitalised in place' },
    {
        group: 'reviews.completeDialog.runSummarize.unavailable.',
        why: "SummarizeAvailability has three members, but the branch runs only when it is not 'available', so the catalog holds two on purpose",
    },

    // The leaf comes from a const array declared beside the call, not from a
    // type. Adding an entry without its copy stays possible; it shows up in the
    // same diff as the array.
    { group: 'about.demos.subject.contributionTexts.', why: 'const array in the component' },
    { group: 'about.demos.subject.parties.', why: 'const array in the component' },
    { group: 'about.demos.subject.people.', why: 'const array in the component' },
    { group: 'about.internal.features.', why: 'const array in the component' },
    { group: 'about.openness.features.', why: 'const array in the component' },
    { group: 'about.recognition.items.', why: 'const array in the component' },
    { group: 'about.team.members.', why: 'const array in the component' },
    { group: 'about.team.roadmap.items.', why: 'const array in the component' },
    { group: 'admin.adminActions.forms.forceDescription.', why: 'const array in the component' },
    { group: 'highlights.sections.', why: 'const array in the component' },
    { group: 'landingV2.bodyType.', why: 'const array in the component' },
    { group: 'landingV2.dateRange.', why: 'const array in the component' },
    { group: 'landingV2.dateRangeMenu.', why: 'const array in the component' },
    { group: 'landingV2.nav.', why: 'const array in the component' },
    { group: 'mcp.clients.', why: 'const array in the component' },
    { group: 'mcp.examples.', why: 'const array in the component' },
    { group: 'reviews.completeDialog.runSummarize.notifications.', why: 'const array in the component' },
    { group: 'reviews.completeDialog.toasts.followUpFailed.actions.', why: 'const array in the component' },
];

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
     * The prefix check above says the group exists. It says nothing about the
     * members, and a member is what actually renders. Every group the scan
     * finds therefore has to appear in COMPUTED_GROUPS, either with the type
     * that supplies its members or with a reason it needs no member check.
     * A new `t(`group.${x}`)` fails here until someone decides which it is.
     */
    it('every computed group is registered in COMPUTED_GROUPS', () => {
        const registered = new Set(COMPUTED_GROUPS.map((g) => g.group));
        const found = [...new Set(groups.map((g) => g.key))];
        expect(found.filter((g) => !registered.has(g)).sort()).toEqual([]);
    });

    it('no registration outlives the call site it describes', () => {
        const found = new Set(groups.map((g) => g.key));
        expect(COMPUTED_GROUPS.map((g) => g.group).filter((g) => !found.has(g)).sort()).toEqual([]);
    });

    describe.each(COMPUTED_GROUPS.filter((g) => g.members))('$group', ({ group, members }) => {
        it('has copy for every member the type declares', () => {
            const declared = members!.prismaEnum
                ? prismaEnumMembers(members!.prismaEnum)
                : unionMembers(members!.file!, members!.type!);
            expect(memberLeaves(catalog, group).sort()).toEqual([...declared].sort());
        });
    });
});
