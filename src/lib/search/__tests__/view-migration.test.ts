import { readFileSync } from 'fs';
import { join } from 'path';
import {
    generatedMigrations,
    parseViewsSql,
    renderMigration,
    viewNamesIn,
} from '../../../../scripts/lib/view-migration';

// The PGSync views reach every database through a Prisma migration that
// scripts/generate-view-migration.ts writes from elasticsearch/views.sql. This
// test is the link between the two files: it fails when views.sql changes and
// no migration carries the change. See issue #638.

const repoRoot = join(__dirname, '..', '..', '..', '..');
const migrationsDir = join(repoRoot, 'prisma', 'migrations');
const viewsSql = readFileSync(join(repoRoot, 'elasticsearch', 'views.sql'), 'utf8');

describe('elasticsearch/views.sql reaches the databases through a migration', () => {
    const generated = generatedMigrations(migrationsDir);
    const newest = generated.at(-1);
    const previous = generated.at(-2);

    test('a generated migration exists', () => {
        expect(newest).toBeDefined();
    });

    test('the newest generated migration matches views.sql', () => {
        // Regenerate from views.sql, with the migration before the newest one as
        // the predecessor that names the views a removal must drop.
        const expected = renderMigration(parseViewsSql(viewsSql), previous ? viewNamesIn(previous.sql) : []);

        expect(newest?.sql).toBe(expected);
    });

    test('every view of views.sql reaches the migration', () => {
        const declared = parseViewsSql(viewsSql).views.map(view => view.name);

        expect(viewNamesIn(newest?.sql ?? '')).toEqual(declared);
    });
});

describe('the generator reads views.sql', () => {
    const sample = `-- A comment above the view.
\\echo 'Creating AView...'
DROP VIEW IF EXISTS "LegacyView";
CREATE OR REPLACE VIEW "AView" AS
SELECT
  a.id,  -- an inline comment
  a.name
FROM "A" a;
-- ============================================================================
-- VERIFICATION CHECKS
-- ============================================================================
SELECT COUNT(*) FROM "AView";
`;

    test('it keeps the statements and drops the comments, the meta-commands and the checks', () => {
        const parsed = parseViewsSql(sample);

        expect(parsed.drops).toEqual(['LegacyView']);
        expect(parsed.views).toEqual([
            { name: 'AView', sql: 'CREATE OR REPLACE VIEW "AView" AS\nSELECT\n  a.id,\n  a.name\nFROM "A" a' },
        ]);
    });

    test('it refuses a statement that a migration cannot carry', () => {
        // Without the banner the verification queries stay in the file. They
        // must never reach a migration, so the generator stops instead.
        expect(() => parseViewsSql(sample.replace('VERIFICATION CHECKS', 'more views'))).toThrow(
            /statement that a migration cannot carry/,
        );
    });

    test('a view that leaves views.sql becomes a drop', () => {
        const rendered = renderMigration(parseViewsSql(sample), ['AView', 'GoneView']);

        expect(rendered).toContain('DROP VIEW IF EXISTS "GoneView";');
        expect(rendered).not.toContain('DROP VIEW IF EXISTS "AView";');
    });
});
