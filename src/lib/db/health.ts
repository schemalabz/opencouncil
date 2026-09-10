import prisma from '@/lib/db/prisma';

export type DatabaseState = {
    database: 'ok' | 'unreachable';
    migration: string | null;
};

/**
 * The newest migration the database has applied, and whether the database
 * answered at all.
 *
 * `_prisma_migrations` is Prisma's own bookkeeping table. It carries no model,
 * so the query is raw. The predicate matches `scripts/copy_db.sh`, which is
 * where this repository already defines an applied migration.
 *
 * The function never throws. `/api/health` is what the release skill polls to
 * learn which build serves traffic, and a poller cannot tell a route that threw
 * from a build that has not switched yet.
 */
export async function getDatabaseState(): Promise<DatabaseState> {
    try {
        const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
            SELECT migration_name
            FROM _prisma_migrations
            WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
            ORDER BY finished_at DESC
            LIMIT 1
        `;

        return { database: 'ok', migration: rows[0]?.migration_name ?? null };
    } catch (error) {
        console.error('Failed to read the migration state:', error);

        return { database: 'unreachable', migration: null };
    }
}
