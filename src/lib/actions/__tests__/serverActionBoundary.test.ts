/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

/**
 * The Server Action boundary of src/lib.
 *
 * A `"use server"` module exports every function as an HTTP endpoint that any
 * browser can post to by its id, whatever page imports it. So:
 *
 * 1. A Client Component imports a `"use server"` module from src/lib/actions
 *    only. The legacy pairs below predate the rule and shrink; a new pair
 *    fails the test.
 * 2. Every export of src/lib/actions gates on the session itself, or hands
 *    the call to one function in src/lib that gates in its own body, or is
 *    public by design and listed below with the reason.
 */

const ROOT = path.resolve(__dirname, '../../../..');
const SRC = path.join(ROOT, 'src');
const ACTIONS = path.join(SRC, 'lib/actions');

/** Client files that still import a `"use server"` module outside src/lib/actions. Remove a line when the file moves. */
const LEGACY_CLIENT_IMPORTS = new Set([
    'src/app/[locale]/(admin)/admin/users/page.tsx -> db/users',
    'src/components/admin/offers/offer-form.tsx -> db/cities',
    'src/components/admin/offers/offer-form.tsx -> db/offers',
    'src/components/admin/offers/offers.tsx -> db/offers',
    'src/components/admin/people/ElectedOrderSheet.tsx -> db/people',
    'src/components/admin/people/people.tsx -> db/people',
    'src/components/admin/people/voiceprint-actions.tsx -> db/tasks',
    'src/components/admin/people/voiceprint-actions.tsx -> db/voiceprints',
    'src/components/admin/reviews/MarkReviewCompleteButton.tsx -> tasks/humanReview',
    'src/components/admin/reviews/ReviewSessionsBreakdown.tsx -> db/reviews',
    'src/components/admin/reviews/ReviewsTable.tsx -> db/reviews',
    'src/components/admin/tasks/ActiveTasks.tsx -> db/tasks',
    'src/components/admin/tasks/BatchRerunActions.tsx -> tasks/batchRerun',
    'src/components/admin/topics/topics-table.tsx -> db/topics',
    'src/components/admin/users/analytics-dashboard.tsx -> db/users',
    'src/components/admin/users/city-ranking-table.tsx -> db/users',
    'src/components/admin/users/expandable-user-row.tsx -> db/users',
    'src/components/cities/CityParties.tsx -> db/parties',
    'src/components/cities/CityPeople.tsx -> db/parties',
    'src/components/cities/CityPeople.tsx -> db/people',
    'src/components/consultations/ConsultationMap.tsx -> db/cities',
    'src/components/consultations/LocationNavigator.tsx -> db/cities',
    'src/components/highlights/HighlightActionsMenu.tsx -> db/highlights',
    'src/components/layout/account-links.tsx -> db/highlights',
    'src/components/meetings/CouncilMeetingDataContext.tsx -> db/people',
    'src/components/meetings/CouncilMeetingDataContext.tsx -> db/speakerSegments',
    'src/components/meetings/CouncilMeetingDataContext.tsx -> db/utterance',
    'src/components/meetings/admin/Admin.tsx -> db/tasks',
    'src/components/meetings/subject-section.tsx -> statistics',
    'src/components/meetings/subject/ContributionCard.tsx -> db/people',
    'src/components/meetings/subject/grouped-discussion-notice.tsx -> statistics',
    'src/components/meetings/transcript/Utterance.tsx -> db/utterance',
    'src/components/onboarding/selectors/LocationSelector.tsx -> db/cities',
    'src/components/parties/Party.tsx -> db/contributions',
    'src/components/parties/Party.tsx -> db/parties',
    'src/components/parties/Party.tsx -> db/people',
    'src/components/persons/Person.tsx -> db/contributions',
    'src/components/persons/Person.tsx -> db/people',
    'src/components/persons/Person.tsx -> statistics',
    'src/components/persons/PersonAvatarList.tsx -> db/people',
    'src/components/presentation/PresentationView.tsx -> db/cities',
    'src/components/profile/NotificationPreferencesSection.tsx -> db/cities',
    'src/components/reviews/CompleteReviewDialog.tsx -> db/reviews',
    'src/components/reviews/CompleteReviewDialog.tsx -> tasks/humanReview',
    'src/components/reviews/useReviewCompletion.ts -> tasks/humanReview',
    'src/components/search/SearchPage.tsx -> db/cities',
    'src/components/search/SearchPage.tsx -> db/parties',
    'src/components/search/SearchPage.tsx -> db/people',
    'src/components/search/SearchPage.tsx -> search',
    'src/components/subject-badge.tsx -> statistics',
    'src/components/user/sign-in.tsx -> serverSignIn',
]);

/** Actions that answer for anyone, with the reason each one may. */
const PUBLIC_ACTIONS: Record<string, string> = {
    'administrativeBodies.getAdministrativeBodiesWithPublicMeetings': 'public record: the bodies that have a public meeting',
    'auth.isUserAuthorizedToEdit': 'the question itself; it answers for the session',
    'contact.submitContactForm': 'the public contact form; validated and rate-limited',
    'decisions.getLastPollTimeForMeeting': 'public read: when the decisions of a meeting were last polled',
    'decisions.requestPollDecisionForSubject': 'public read of the decision of one subject from Diavgeia; no write to our data',
    'decisions.getDecisionForSubject': 'public read: the decision of a subject',
    'notifications.getUserPreferences': 'reads the preferences of the session itself; nothing for a signed-out visitor',
    'notifications.saveNotificationPreferences': 'the public signup form; validated in the db module',
    'notifications.savePetition': 'the public petition form; validated in the db module',
    'personJoin.sendJoinEmail': 'a signed-out scanner; the signed claim token is the credential',
    'personJoin.startJoinGoogle': 'a signed-out scanner; the signed claim token is the credential',
    'signupPlaces.getNearbySubjects': 'public read: hot subjects near a point',
    'signupPlaces.reverseGeocodePlace': 'public read: the name of a place',
};

const GUARD = /\b(withUserAuthorizedToEdit|isUserAuthorizedToEdit|getCurrentUser|isSuperAdmin|auth)\s*\(/;

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
}

function stripComments(code: string): string {
    return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function hasDirective(code: string, directive: string): boolean {
    return new RegExp(`^\\s*(['"])${directive}\\1`).test(stripComments(code));
}

function resolveLibModule(spec: string): string | null {
    const base = path.join(SRC, 'lib', spec);
    for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
}

type LibImport = { local: string; imported: string; spec: string };

function sourceFile(code: string) {
    return ts.createSourceFile('boundary.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function libImports(code: string, file: string): LibImport[] {
    const out: LibImport[] = [];
    for (const node of sourceFile(code).statements) {
        if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
        const clause = node.importClause;
        if (!clause || clause.isTypeOnly) continue;
        const modulePath = node.moduleSpecifier.text;
        const target = modulePath.startsWith('@/')
            ? path.join(SRC, modulePath.slice(2))
            : modulePath.startsWith('.') ? path.resolve(path.dirname(file), modulePath) : null;
        if (!target) continue;
        const spec = path.relative(path.join(SRC, 'lib'), target).replace(/\\/g, '/');
        if (spec === '..' || spec.startsWith('../')) continue;
        if (clause.name) out.push({ local: clause.name.text, imported: 'default', spec });
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
            for (const binding of clause.namedBindings.elements) {
                if (binding.isTypeOnly) continue;
                out.push({ local: binding.name.text, imported: (binding.propertyName ?? binding.name).text, spec });
            }
        }
        if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
            out.push({ local: clause.namedBindings.name.text, imported: '*', spec });
        }
    }
    return out;
}

type Fn = { name: string; body: string };

function functions(code: string, exportedOnly: boolean): Fn[] {
    const out: Fn[] = [];
    for (const node of sourceFile(code).statements) {
        if (exportedOnly && (ts.isExportAssignment(node) || (ts.isExportDeclaration(node) && !node.isTypeOnly))) {
            throw new Error('Unsupported action export');
        }
        const exported = ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
        if (exportedOnly && !exported) continue;
        if (exportedOnly && ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) {
            throw new Error('Unsupported action export');
        }
        if (ts.isFunctionDeclaration(node) && node.name) {
            out.push({ name: node.name.text, body: stripComments(node.getText()) });
        } else if (ts.isVariableStatement(node)) {
            for (const declaration of node.declarationList.declarations) {
                if (!ts.isIdentifier(declaration.name)) {
                    if (exportedOnly) throw new Error('Unsupported action binding');
                    continue;
                }
                out.push({ name: declaration.name.text, body: stripComments(declaration.getText()) });
            }
        }
    }
    return out;
}

function exportedFunctions(code: string): Fn[] {
    return functions(code, true);
}

function anyFunction(code: string, name: string): Fn | null {
    return functions(code, false).find(fn => fn.name === name) ?? null;
}

/** True when the function gates in its body, or hands the call to one imported src/lib function that does. */
function isGated(fn: Fn, imports: LibImport[]): boolean {
    if (GUARD.test(fn.body)) return true;
    for (const imp of imports) {
        if (!new RegExp(`\\b${imp.local}\\s*\\(`).test(fn.body)) continue;
        const file = resolveLibModule(imp.spec);
        if (!file) continue;
        const target = anyFunction(fs.readFileSync(file, 'utf8'), imp.imported);
        if (target && GUARD.test(target.body)) return true;
    }
    return false;
}

describe('the boundary scanner', () => {
    it.each([
        'export { unsafe };',
        "export * from './unsafe';",
        'export default async () => 1;',
    ])('rejects unsupported action exports: %s', (code) => {
        expect(() => exportedFunctions(code)).toThrow('Unsupported action export');
    });

    it('does not count a commented-out guard as authorization', () => {
        const [fn] = exportedFunctions('export async function unsafe() { /* withUserAuthorizedToEdit({}) */ return 1; }');
        expect(isGated(fn, [])).toBe(false);
    });

    it('checks exported arrows without borrowing a later function gate', () => {
        const functions = exportedFunctions(`
export const unsafe = async () => 1;
export async function safe() { await withUserAuthorizedToEdit({}); }
`);
        expect(functions.map(fn => fn.name)).toEqual(['unsafe', 'safe']);
        expect(isGated(functions[0], [])).toBe(false);
        expect(isGated(functions[1], [])).toBe(true);
    });

    it('resolves relative imports to the same library module as alias imports', () => {
        const file = path.join(SRC, 'components/Probe.tsx');
        const expected = [{ local: 'transcribe', imported: 'requestTranscribe', spec: 'tasks/transcribe' }];
        expect(libImports("import { requestTranscribe as transcribe } from '../lib/tasks/transcribe';", file)).toEqual(expected);
        expect(libImports("import { requestTranscribe as transcribe } from '@/lib/tasks/transcribe';", file)).toEqual(expected);
    });
});

describe('the Server Action boundary', () => {
    const clientFiles = walk(SRC).filter((file) => hasDirective(fs.readFileSync(file, 'utf8'), 'use client'));
    const actionFiles = fs.readdirSync(ACTIONS).filter((f) => f.endsWith('.ts')).map((f) => path.join(ACTIONS, f));

    it('finds the client files it checks', () => {
        expect(clientFiles.length).toBeGreaterThan(50);
    });

    it('lets a Client Component import a "use server" module from src/lib/actions only', () => {
        const seen = new Set<string>();
        const offenders: string[] = [];
        for (const file of clientFiles) {
            const code = fs.readFileSync(file, 'utf8');
            for (const spec of new Set(libImports(code, file).map((imp) => imp.spec))) {
                const target = resolveLibModule(spec);
                if (!target || !hasDirective(fs.readFileSync(target, 'utf8'), 'use server')) continue;
                if (spec.startsWith('actions/')) continue;
                const pair = `${path.relative(ROOT, file)} -> ${spec}`;
                seen.add(pair);
                if (!LEGACY_CLIENT_IMPORTS.has(pair)) offenders.push(pair);
            }
        }
        expect(offenders).toEqual([]);
        const stale = [...LEGACY_CLIENT_IMPORTS].filter((pair) => !seen.has(pair));
        expect(stale).toEqual([]);
    });

    it('marks every module of src/lib/actions "use server"', () => {
        const unmarked = actionFiles.filter((file) => !hasDirective(fs.readFileSync(file, 'utf8'), 'use server'));
        expect(unmarked).toEqual([]);
    });

    it('gates every export of src/lib/actions, or lists it as public with a reason', () => {
        const ungated: string[] = [];
        const seen = new Set<string>();
        for (const file of actionFiles) {
            const code = fs.readFileSync(file, 'utf8');
            const imports = libImports(code, file);
            const moduleName = path.basename(file, '.ts');
            for (const fn of exportedFunctions(code)) {
                const key = `${moduleName}.${fn.name}`;
                seen.add(key);
                if (key in PUBLIC_ACTIONS) continue;
                if (!isGated(fn, imports)) ungated.push(key);
            }
        }
        expect(ungated).toEqual([]);
        const stale = Object.keys(PUBLIC_ACTIONS).filter((key) => !seen.has(key));
        expect(stale).toEqual([]);
    });
});
