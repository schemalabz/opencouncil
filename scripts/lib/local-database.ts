import { PrismaClient } from "@prisma/client";

const LOCAL_HOSTS = ["127.0.0.1", "::1"];

/**
 * A write is allowed only on a database this machine runs. This asks the
 * live connection, not the DATABASE_URL string: a nix shell that re-exports
 * a production DATABASE_URL must not fool this guard.
 */
export async function assertLocalDatabase(
    prisma: PrismaClient,
    allowedDatabases: readonly string[],
): Promise<void> {
    const [row] = await prisma.$queryRaw<{ db: string; host: string | null }[]>`
        select current_database() as db, host(inet_server_addr()) as host
    `;
    console.log(`Connected to database "${row.db}" on host "${row.host}"`);
    if (row.host === null || !LOCAL_HOSTS.includes(row.host) || !allowedDatabases.includes(row.db)) {
        throw new Error(
            `Refusing to run: expected a local database (host one of ${LOCAL_HOSTS.join(", ")}, ` +
            `database one of ${allowedDatabases.join(", ")}), got database "${row.db}" on host "${row.host}". ` +
            `This script only ever touches a local dev database.`,
        );
    }
}
