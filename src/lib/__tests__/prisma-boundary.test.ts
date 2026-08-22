import fs from 'fs';
import path from 'path';

/**
 * Architecture guard: the Prisma client must be imported only inside
 * src/lib/db. Every other module reaches the database through a data-access
 * function in src/lib/db. This keeps the code that touches the database — and
 * therefore the code that must carry an authorization check — in one place.
 *
 * The rule is not "no queries elsewhere yet" — a number of server-side callers
 * still hold a raw client (tasks, search, several API routes, ...). They are
 * grandfathered in ALLOWED_PREFIXES / ALLOWED_FILES below. The test fails when
 * a NEW file outside that set imports the client. Shrinking the allow-list by
 * moving each caller into src/lib/db is the tracked follow-up; NEVER add a new
 * entry to make this test pass — add a src/lib/db function instead.
 */

const SRC = path.join(process.cwd(), 'src');
const DB_DIR = path.join('src', 'lib', 'db') + path.sep;

// Matches a static import, dynamic import(), or require() of the Prisma
// singleton (…/db/prisma or @/lib/db/prisma), and a value import or
// instantiation of PrismaClient. Type-only imports from @prisma/client (City,
// Prisma, etc.) are intentionally NOT matched — those are allowed everywhere.
const SINGLETON_IMPORT = /(?:from|import|require)\s*\(?\s*['"][^'"]*db\/prisma['"]/;
const PRISMA_CLIENT_VALUE = /new\s+PrismaClient\s*\(|import\s*\{[^}]*\bPrismaClient\b[^}]*\}\s*from\s*['"]@prisma\/client['"]/;

// Server-side directories whose files may still hold a raw client today.
const ALLOWED_PREFIXES = [
    path.join('src', 'lib', 'db') + path.sep,
    path.join('src', 'lib', 'tasks') + path.sep,
    path.join('src', 'lib', 'search') + path.sep,
    path.join('src', 'lib', 'mcp') + path.sep,
    path.join('src', 'lib', 'notifications') + path.sep,
    path.join('src', 'lib', 'auth') + path.sep,
    path.join('src', 'lib', 'email') + path.sep,
    path.join('src', 'lib', 'minutes') + path.sep,
];

// Individual server-side files that still hold a raw client today. New pages,
// components, and API routes are deliberately absent, so they are blocked.
const ALLOWED_FILES = new Set([
    'src/auth.ts',
    'src/instrumentation-node.ts',
    'src/lib/auth.ts',
    'src/lib/statistics.ts',
    'src/lib/pilotStats.ts',
    'src/app/sitemap.ts',
    'src/app/qr/[code]/route.ts',
    'src/app/[locale]/(admin)/admin/conversations/actions.ts',
    'src/app/[locale]/(admin)/admin/reports/page.tsx',
    'src/app/api/admin/elasticsearch/status/route.ts',
    'src/app/api/admin/entities/route.ts',
    'src/app/api/admin/notifications/release/route.ts',
    'src/app/api/admin/qr/[id]/route.ts',
    'src/app/api/admin/qr/route.ts',
    'src/app/api/admin/reports/route.ts',
    'src/app/api/admin/reviews/volume-chart/route.ts',
    'src/app/api/admin/users/[userId]/resend-invite/route.ts',
    'src/app/api/cities/[cityId]/administrative-bodies/route.ts',
    'src/app/api/cities/[cityId]/meetings/[meetingId]/decisions/route.ts',
    'src/app/api/cities/[cityId]/meetings/[meetingId]/notifications/route.ts',
    'src/app/api/cities/[cityId]/meetings/[meetingId]/operator/route.ts',
    'src/app/api/cities/[cityId]/meetings/[meetingId]/subjects/[subjectId]/route.ts',
    'src/app/api/cities/[cityId]/meetings/route.ts',
    'src/app/api/cities/[cityId]/populate/route.ts',
    'src/app/api/cities/[cityId]/reset/route.ts',
    'src/app/api/dev/quick-login/route.ts',
    'src/app/api/dev/seed-test-users/route.ts',
    'src/app/api/dev/seed-users/route.ts',
    'src/app/api/og/route.tsx',
    'src/app/api/subject/[subjectId]/first-utterance/[speakerId]/route.ts',
    'src/app/api/subject/voting-utterances/route.ts',
    'src/app/api/utterance/[utteranceId]/route.ts',
    'src/app/api/webhooks/bird/route.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
            walk(full, out);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

function rel(file: string): string {
    return path.relative(process.cwd(), file).split(path.sep).join('/');
}

describe('Prisma client boundary', () => {
    const files = walk(SRC);

    it('finds source files to scan', () => {
        expect(files.length).toBeGreaterThan(100);
    });

    it('imports the Prisma client only inside src/lib/db or a grandfathered caller', () => {
        const relDb = DB_DIR.split(path.sep).join('/');
        const violations: string[] = [];

        for (const file of files) {
            const source = fs.readFileSync(file, 'utf8');
            if (!SINGLETON_IMPORT.test(source) && !PRISMA_CLIENT_VALUE.test(source)) continue;

            const r = rel(file);
            if (r.startsWith(relDb)) continue; // src/lib/db owns the client
            if (ALLOWED_FILES.has(r)) continue;
            if (ALLOWED_PREFIXES.some(p => r.startsWith(p.split(path.sep).join('/')))) continue;

            violations.push(r);
        }

        expect({ violations }).toEqual({ violations: [] });
    });
});
