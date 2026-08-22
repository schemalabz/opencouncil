import fs from 'fs';
import path from 'path';

/**
 * Smoke test for the /admin auth model.
 *
 * The (admin) layout's guard does not re-run on an RSC soft-navigation, so it
 * cannot be the only gate. Every server-component page under /admin must
 * re-assert an authorization check in its own body; a page that renders no
 * server data of its own may instead be a "use client" page (its data comes
 * from API routes, which carry their own guards). This test enforces that
 * invariant so a new unguarded admin page fails CI.
 */

const ADMIN_DIR = path.join(process.cwd(), 'src', 'app', '[locale]', '(admin)', 'admin');
const LAYOUT = path.join(ADMIN_DIR, 'layout.tsx');

const GUARD = /withUserAuthorizedToEdit|isUserAuthorizedToEdit/;
const USE_CLIENT = /^\s*['"]use client['"]/;

function findPages(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            findPages(full, out);
        } else if (entry.name === 'page.tsx') {
            out.push(full);
        }
    }
    return out;
}

function rel(file: string): string {
    return path.relative(process.cwd(), file).split(path.sep).join('/');
}

describe('/admin auth guard', () => {
    it('has an admin route group to scan', () => {
        expect(fs.existsSync(ADMIN_DIR)).toBe(true);
        expect(findPages(ADMIN_DIR).length).toBeGreaterThan(5);
    });

    it('keeps the superadmin guard on the (admin) layout', () => {
        const source = fs.readFileSync(LAYOUT, 'utf8');
        // getCurrentUser() + withUserAuthorizedToEdit({}) — the server-side twin
        // of the proxy.ts middleware belt.
        expect(source).toMatch(/getCurrentUser/);
        expect(source).toMatch(/withUserAuthorizedToEdit\(\s*\{\s*\}\s*\)/);
    });

    it('every admin page re-asserts a guard or is a client page', () => {
        const unguarded: string[] = [];

        for (const page of findPages(ADMIN_DIR)) {
            const source = fs.readFileSync(page, 'utf8');
            const isClient = source.split('\n').slice(0, 3).some(l => USE_CLIENT.test(l));
            if (isClient) continue; // data comes from guarded API routes
            if (GUARD.test(source)) continue; // re-asserts auth in the page body
            unguarded.push(rel(page));
        }

        expect({ unguarded }).toEqual({ unguarded: [] });
    });
});
