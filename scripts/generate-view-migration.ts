/**
 * Fills an empty Prisma migration with the PGSync view DDL from
 * elasticsearch/views.sql.
 *
 * Usage:
 *   npx prisma migrate dev --create-only --name essync_<what_changed>
 *   npm run views:migration
 *
 * The first command creates the empty migration and names it. The second one
 * writes the views into it. The test
 * src/lib/search/__tests__/view-migration.test.ts fails when views.sql changes
 * and no migration carries the change. See issue #638.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
    MIGRATION_NAME_PREFIX,
    generatedMigrations,
    hasStatements,
    migrationDirectories,
    parseViewsSql,
    renderMigration,
    viewNamesIn,
} from './lib/view-migration';

const repoRoot = join(__dirname, '..');
const migrationsDir = join(repoRoot, 'prisma', 'migrations');
const viewsPath = join(repoRoot, 'elasticsearch', 'views.sql');

function migrationSqlPath(name: string): string {
    return join(migrationsDir, name, 'migration.sql');
}

function main(): void {
    const views = parseViewsSql(readFileSync(viewsPath, 'utf8'));
    const generated = generatedMigrations(migrationsDir);
    const previous = generated.at(-1);
    const sql = renderMigration(views, previous ? viewNamesIn(previous.sql) : []);

    const unfilled = migrationDirectories(migrationsDir).filter(name => {
        const path = migrationSqlPath(name);
        return !existsSync(path) || !hasStatements(readFileSync(path, 'utf8'));
    });
    const target = unfilled.at(-1);

    if (!target) {
        if (previous && previous.sql === sql) {
            console.log(`Up to date: ${previous.name} matches elasticsearch/views.sql.`);
            return;
        }
        console.error(
            'elasticsearch/views.sql differs from the newest generated migration, and there is no\n' +
                'empty migration to fill. Create one first:\n' +
                `  npx prisma migrate dev --create-only --name ${MIGRATION_NAME_PREFIX}<what_changed>`,
        );
        process.exit(1);
    }

    writeFileSync(migrationSqlPath(target), sql);

    const before = previous ? viewNamesIn(previous.sql) : [];
    const after = views.views.map(view => view.name);
    const added = after.filter(name => !before.includes(name));
    const removed = before.filter(name => !after.includes(name));

    console.log(`Wrote ${after.length} views to prisma/migrations/${target}/migration.sql`);
    if (added.length > 0) console.log(`  added: ${added.join(', ')}`);
    if (removed.length > 0) console.log(`  dropped: ${removed.join(', ')}`);
}

main();
