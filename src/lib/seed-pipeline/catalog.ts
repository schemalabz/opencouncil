import { Client } from 'pg';
import { type CatalogFk, type PgSyncObjects, PGSYNC_TRIGGER_FUNCTION, PGSYNC_VIEW, quoteIdent } from './normalize';

/** Open a connection to `url`, run `fn`, and close the connection in every case. */
export async function withClient<T>(url: string, fn: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
        return await fn(client);
    } finally {
        await client.end();
    }
}

const FOREIGN_KEYS_SQL = `
SELECT c.relname AS "table",
       con.conname AS "constraint",
       p.relname AS "refTable",
       -- ::text: pg_attribute.attname is type "name", not "text". node-postgres has
       -- no default array parser for "name[]" (OID 1003), so it comes back as the
       -- raw "{a,b}" literal instead of a JS array unless cast to text[] (OID 1009).
       (SELECT array_agg(a.attname::text ORDER BY k.ord)
          FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum) AS "columns",
       (SELECT array_agg(a.attname::text ORDER BY k.ord)
          FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum) AS "refColumns",
       (SELECT array_agg(a.attname::text ORDER BY k.ord)
          FROM pg_constraint pk
          -- A comma join here (FROM pg_constraint pk, unnest(...)) would put the
          -- unnest's ON clause in a scope where pk is not yet visible.
          JOIN unnest(pk.conkey) WITH ORDINALITY k(attnum, ord) ON true
          JOIN pg_attribute a ON a.attrelid = pk.conrelid AND a.attnum = k.attnum
         WHERE pk.conrelid = con.confrelid AND pk.contype = 'p') AS "parentPk",
       pg_get_constraintdef(con.oid) AS "definition"
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_class p ON p.oid = con.confrelid
 WHERE con.contype = 'f' AND c.relnamespace = 'public'::regnamespace
 ORDER BY 1, 2`;

export type RawFkRow = Omit<CatalogFk, 'parentPk'> & { parentPk: string[] | null };

export async function listForeignKeys(client: Client): Promise<CatalogFk[]> {
    const { rows } = await client.query<RawFkRow>(FOREIGN_KEYS_SQL);
    return rows.map((row) => {
        if (row.parentPk === null) {
            throw new Error(`${row.constraint}: parent ${row.refTable} has no primary key`);
        }
        return { ...row, parentPk: row.parentPk };
    });
}

const INDEX_COLUMNS_SQL = `
SELECT t.relname AS "table",
       (SELECT array_agg(a.attname::text ORDER BY k.ord)
          FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum) AS "columns"
  FROM pg_index i
  JOIN pg_class t ON t.oid = i.indrelid
 WHERE t.relnamespace = 'public'::regnamespace`;

export type IndexColumns = { table: string; columns: string[] };

/** The key columns of every index in the public schema, in index order. An expression column has no name, so it is left out. */
export async function listIndexColumns(client: Client): Promise<IndexColumns[]> {
    const { rows } = await client.query<{ table: string; columns: string[] | null }>(INDEX_COLUMNS_SQL);
    return rows.map((row) => ({ table: row.table, columns: row.columns ?? [] }));
}

/**
 * Foreign keys that no index leads with. Deleting a parent row then scans the
 * whole child table once per row, for the ON DELETE action of each such key.
 */
export function unindexedForeignKeys(fks: CatalogFk[], indexes: IndexColumns[]): CatalogFk[] {
    return fks.filter((fk) => !indexes.some((index) => {
        if (index.table !== fk.table) return false;
        const leading = new Set(index.columns.slice(0, fk.columns.length));
        return fk.columns.every((column) => leading.has(column));
    }));
}

export function misorderedCompositeFks(fks: CatalogFk[]): CatalogFk[] {
    return fks.filter((fk) => fk.columns.length > 1 && fk.refColumns.join(',') !== fk.parentPk.join(','));
}

export function selfReferencingFks(fks: CatalogFk[]): CatalogFk[] {
    return fks.filter((fk) => fk.table === fk.refTable);
}

export function fksOfTables(fks: CatalogFk[], tables: string[]): CatalogFk[] {
    const wanted = new Set(tables);
    return fks.filter((fk) => wanted.has(fk.table));
}

export async function constraintExists(client: Client, name: string): Promise<boolean> {
    const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n
           FROM pg_constraint con
           JOIN pg_class c ON c.oid = con.conrelid
          WHERE con.conname = $1 AND c.relnamespace = 'public'::regnamespace`,
        [name],
    );
    return rows[0].n !== '0';
}

export async function tableRowCounts(client: Client, tables: string[]): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const table of tables) {
        const { rows } = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM public.${quoteIdent(table)}`);
        counts[table] = Number(rows[0].n);
    }
    return counts;
}

export async function migrationHead(client: Client): Promise<string | null> {
    const { rows } = await client.query<{ name: string | null }>(
        'SELECT max(migration_name) AS name FROM public._prisma_migrations WHERE finished_at IS NOT NULL',
    );
    return rows[0]?.name ?? null;
}

export async function listTables(client: Client): Promise<string[]> {
    const { rows } = await client.query<{ name: string }>(
        "SELECT relname AS name FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY 1",
    );
    return rows.map((r) => r.name);
}

/** The first primary-key column of each table in public. A table without a primary key has no entry. */
export async function primaryKeyColumns(client: Client): Promise<Record<string, string>> {
    const { rows } = await client.query<{ table: string; column: string }>(
        `SELECT c.relname AS "table", a.attname::text AS "column"
           FROM pg_constraint con
           JOIN pg_class c ON c.oid = con.conrelid
           JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
          WHERE con.contype = 'p' AND c.relnamespace = 'public'::regnamespace`,
    );
    return Object.fromEntries(rows.map((r) => [r.table, r.column]));
}

/** PGSync's change-capture objects: every user trigger that calls public.table_notify(), the function, and public._view. */
export async function listPgSyncObjects(client: Client): Promise<PgSyncObjects> {
    const { rows: triggers } = await client.query<{ schema: string; table: string; trigger: string }>(
        `SELECT n.nspname AS "schema", c.relname AS "table", t.tgname AS "trigger"
           FROM pg_trigger t
           JOIN pg_class c ON c.oid = t.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           JOIN pg_proc p ON p.oid = t.tgfoid
          WHERE NOT t.tgisinternal AND p.proname = $1 AND p.pronamespace = 'public'::regnamespace
          ORDER BY 1, 2, 3`,
        [PGSYNC_TRIGGER_FUNCTION],
    );
    const { rows } = await client.query<{ hasFunction: boolean; hasView: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = $1 AND pronamespace = 'public'::regnamespace AND pronargs = 0) AS "hasFunction",
                EXISTS (SELECT 1 FROM pg_class WHERE relname = $2 AND relnamespace = 'public'::regnamespace AND relkind = 'm') AS "hasView"`,
        [PGSYNC_TRIGGER_FUNCTION, PGSYNC_VIEW],
    );
    return { triggers, hasFunction: rows[0].hasFunction, hasView: rows[0].hasView };
}
