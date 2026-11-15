import type { Client } from 'pg';
import { fksOfTables, listForeignKeys, withClient } from './catalog';
import { quoteIdent, quoteLiteral } from './normalize';

/**
 * Where `reset` keeps the private rows while it replaces public. An artifact's
 * private tables are always empty, so a reset that drops them loses every
 * account, right and token of the database. The schema outlives a failed
 * migration or carry: the next `reset` finds it and finishes the carry.
 */
export const KEEP_SCHEMA = 'seed_keep';
const GRANTS_TABLE = '_grants';

/**
 * How long the replace, and the carry after it, wait for each lock that another
 * session holds. A session that holds one and never ends (on staging, an app
 * backend that stalled for hours) would otherwise hold up the reset, and every
 * session that queues behind it. The timeout rolls the transaction back.
 */
export const LOCK_TIMEOUT = '1min';

/**
 * SQL for the restore's transaction, before the replace drops public: move the
 * private tables, their implicit join tables (`_X`, which Prisma makes for a
 * relation of a private model), and the enum and domain types of their columns
 * into KEEP_SCHEMA, and record the grants on public's objects, which the restore
 * does not load. The replace drops public's types with CASCADE, which would drop
 * a kept column of that type, so the types move too.
 *
 * When KEEP_SCHEMA exists, an earlier reset kept the rows already and did not
 * bring them back, and this keeps nothing new. Unless public has a private row
 * that KEEP_SCHEMA does not hold (someone used the database since): the replace
 * would drop it, so the transaction stops. A row that a migration made again has
 * the id of its kept copy, so it does not stop it.
 */
export function keepPrivateRowsSql(tables: readonly string[]): string {
    return `DO $keep$
DECLARE
    kept text[] := ARRAY[${tables.map(quoteLiteral).join(', ')}]::text[];
    r record;
    newer boolean;
BEGIN
    IF to_regnamespace('${KEEP_SCHEMA}') IS NOT NULL THEN
        FOR r IN
            SELECT c.relname, (SELECT string_agg(format('k.%1$I = t.%1$I', a.attname), ' AND ') FROM pg_constraint pk
                    JOIN pg_attribute a ON a.attrelid = pk.conrelid AND a.attnum = ANY (pk.conkey)
                    WHERE pk.conrelid = c.oid AND pk.contype = 'p') AS same_key
            FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname = ANY (kept)
              AND to_regclass(format('${KEEP_SCHEMA}.%I', c.relname)) IS NOT NULL
        LOOP
            CONTINUE WHEN r.same_key IS NULL;
            EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%1$I t WHERE NOT EXISTS (SELECT 1 FROM ${KEEP_SCHEMA}.%1$I k WHERE %2$s))', r.relname, r.same_key) INTO newer;
            IF newer THEN
                RAISE EXCEPTION 'the schema ${KEEP_SCHEMA} holds private rows that an earlier reset did not bring back, and public.% has rows that it does not hold: \`npm run seed -- setup\` brings the kept rows back first, and \`npm run seed -- reset --drop-private\` discards both', quote_ident(r.relname);
            END IF;
        END LOOP;
        RETURN;
    END IF;
    CREATE SCHEMA ${KEEP_SCHEMA};
    CREATE TABLE ${KEEP_SCHEMA}.${GRANTS_TABLE} AS
        SELECT c.relname::text AS relname, c.relacl FROM pg_class c
        WHERE c.relnamespace = 'public'::regnamespace AND c.relacl IS NOT NULL;
    kept := kept || ARRAY(
        SELECT DISTINCT c.relname::text FROM pg_constraint k
        JOIN pg_class c ON c.oid = k.conrelid JOIN pg_class p ON p.oid = k.confrelid
        WHERE k.contype = 'f' AND c.relnamespace = 'public'::regnamespace AND c.relname LIKE '\\_%' AND p.relname = ANY (kept));
    FOR r IN
        SELECT DISTINCT b.typname FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid JOIN pg_type t ON t.oid = a.atttypid
        JOIN pg_type b ON b.oid = CASE WHEN t.typcategory = 'A' THEN t.typelem ELSE t.oid END
        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname = ANY (kept)
          AND a.attnum > 0 AND NOT a.attisdropped AND b.typnamespace = 'public'::regnamespace AND b.typtype IN ('e', 'd')
    LOOP
        EXECUTE format('ALTER TYPE public.%I SET SCHEMA ${KEEP_SCHEMA}', r.typname);
    END LOOP;
    FOR r IN SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname = ANY (kept)
    LOOP
        EXECUTE format('ALTER TABLE public.%I SET SCHEMA ${KEEP_SCHEMA}', r.relname);
    END LOOP;
END
$keep$;
`;
}

/**
 * For `reset --drop-private`: the rows that an earlier reset kept go too. The
 * grants that it recorded stay, since they are the database's from before that
 * reset; the restore loads none.
 */
export const DROP_KEPT_ROWS_SQL = `DO $drop$
DECLARE r record;
BEGIN
    FOR r IN SELECT relname FROM pg_class WHERE relnamespace = to_regnamespace('${KEEP_SCHEMA}') AND relkind = 'r' AND relname <> '${GRANTS_TABLE}'
    LOOP
        EXECUTE format('DROP TABLE ${KEEP_SCHEMA}.%I CASCADE', r.relname);
    END LOOP;
END
$drop$;
`;

/** `pointless`: rows that point at a row that no longer exists, or whose table no longer exists. The rest of what is not carried conflicted with a row in public. */
/**
 * Grant again what public's objects had, by name, from the grants that the keep
 * recorded. The restore runs it before its COMMIT, so a reader such as Notis
 * never finds a view without its grant; the carry runs it again for an object
 * that a migration made anew.
 */
export const GRANT_AGAIN_SQL = `DO $grants$ DECLARE r record; BEGIN
    FOR r IN SELECT g.relname, (g.acl).privilege_type AS privilege,
            CASE (g.acl).grantee WHEN 0 THEN 'PUBLIC' ELSE (SELECT quote_ident(rolname) FROM pg_roles WHERE oid = (g.acl).grantee) END AS grantee
        FROM (SELECT relname, aclexplode(relacl) AS acl FROM ${KEEP_SCHEMA}.${GRANTS_TABLE}) g
        JOIN pg_class c ON c.relname = g.relname AND c.relnamespace = 'public'::regnamespace
        -- A role that was dropped since the grant was recorded has nothing to receive.
        WHERE (g.acl).grantee <> c.relowner AND ((g.acl).grantee = 0 OR EXISTS (SELECT 1 FROM pg_roles WHERE oid = (g.acl).grantee))
    LOOP EXECUTE format('GRANT %s ON public.%I TO %s', r.privilege, r.relname, r.grantee); END LOOP;
END $grants$;
`;

export type KeptTable = { table: string; kept: number; carried: number; pointless: number };

/** One line on the carry: how many rows came back, and why the others did not. */
export function describeKeptRows(report: KeptTable[]): string {
    const carried = report.reduce((n, t) => n + t.carried, 0);
    const lost = (count: (t: KeptTable) => number) => report.filter((t) => count(t) > 0).map((t) => `${t.table} ${count(t)}`).join(', ');
    const pointless = lost((t) => t.pointless);
    const conflicting = lost((t) => t.kept - t.pointless - t.carried);
    return [
        `kept ${carried} private rows`,
        pointless && `left out as they point at rows that no longer exist: ${pointless}`,
        conflicting && `left out as they conflict with rows already in public (made by a migration, or by a sign-in during the reset): ${conflicting}`,
    ].filter(Boolean).join('; ');
}

type Column = { table: string; column: string; type: string; kept: boolean };

async function columns(client: Client, schema: string): Promise<Column[]> {
    const { rows } = await client.query<Column>(`
        SELECT c.relname AS "table", a.attname AS "column", format_type(a.atttypid, a.atttypmod) AS "type",
               b.typnamespace = to_regnamespace($2) AS "kept"
        FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_type t ON t.oid = a.atttypid
        JOIN pg_type b ON b.oid = CASE WHEN t.typcategory = 'A' THEN t.typelem ELSE t.oid END
        WHERE c.relnamespace = to_regnamespace($1) AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
        ORDER BY c.relname, a.attnum`, [schema, KEEP_SCHEMA]);
    return rows;
}

/**
 * Copy the kept rows into the tables that the restore and the migrations made,
 * then grant again what public had, and drop KEEP_SCHEMA. One transaction: a
 * failure keeps KEEP_SCHEMA, and the next reset carries again.
 *
 * Parents come first. A row comes back when every row that it points at exists,
 * so a right to content that the artifact does not have is left out. Columns are
 * matched by name: a column that a migration removed is left out, and one that it
 * added takes its default. A kept enum column has the old type, so its value goes
 * through text into the new one. A row that conflicts with one that a migration
 * made again is left out. Returns null when there is nothing to carry.
 */
export async function carryKeptRows(databaseUrl: string, lockTimeout = LOCK_TIMEOUT): Promise<KeptTable[] | null> {
    return withClient(databaseUrl, async (client) => {
        if ((await client.query(`SELECT to_regnamespace($1) AS s`, [KEEP_SCHEMA])).rows[0].s === null) return null;
        try {
            await client.query('BEGIN');
            await client.query(`SET LOCAL lock_timeout = ${quoteLiteral(lockTimeout)}`);
            const target = new Map<string, Column[]>();
            for (const c of await columns(client, 'public')) target.set(c.table, [...(target.get(c.table) ?? []), c]);
            const source = new Map<string, Map<string, Column>>();
            for (const c of await columns(client, KEEP_SCHEMA)) {
                if (c.table === GRANTS_TABLE) continue;
                source.set(c.table, (source.get(c.table) ?? new Map()).set(c.column, c));
            }
            const fks = fksOfTables(await listForeignKeys(client), [...source.keys()]);

            const report: KeptTable[] = [];
            const pending = new Set(source.keys());
            while (pending.size) {
                const ready = [...pending].filter((t) => fks.every((fk) => fk.table !== t || fk.refTable === t || !pending.has(fk.refTable))).sort();
                if (!ready.length) throw new Error(`the kept tables ${[...pending].join(', ')} point at each other in a cycle`);
                for (const table of ready) {
                    pending.delete(table);
                    const kept = Number((await client.query(`SELECT count(*) AS n FROM ${KEEP_SCHEMA}.${quoteIdent(table)}`)).rows[0].n);
                    const shared = (target.get(table) ?? []).filter((c) => source.get(table)!.has(c.column));
                    if (!shared.length) {
                        report.push({ table, kept, carried: 0, pointless: kept });
                        continue;
                    }
                    const value = (c: Column) => `k.${quoteIdent(c.column)}${source.get(table)!.get(c.column)!.kept ? '::text' : ''}::${c.type}`;
                    const byName = new Map(shared.map((c) => [c.column, c]));
                    const present = fks.filter((fk) => fk.table === table && fk.columns.every((c) => byName.has(c))).map((fk) =>
                        `(${fk.columns.map((c) => `k.${quoteIdent(c)} IS NULL`).join(' OR ')} OR EXISTS (SELECT 1 FROM public.${quoteIdent(fk.refTable)} p WHERE ${
                            fk.columns.map((c, i) => `p.${quoteIdent(fk.refColumns[i])} = ${value(byName.get(c)!)}`).join(' AND ')}))`);
                    const where = present.join(' AND ') || 'true';
                    const pointing = Number((await client.query(`SELECT count(*) AS n FROM ${KEEP_SCHEMA}.${quoteIdent(table)} k WHERE ${where}`)).rows[0].n);
                    const { rowCount } = await client.query(
                        `INSERT INTO public.${quoteIdent(table)} (${shared.map((c) => quoteIdent(c.column)).join(', ')})
                         SELECT ${shared.map(value).join(', ')} FROM ${KEEP_SCHEMA}.${quoteIdent(table)} k
                         WHERE ${where} ON CONFLICT DO NOTHING`);
                    report.push({ table, kept, carried: rowCount ?? 0, pointless: kept - pointing });
                }
            }
            await client.query(GRANT_AGAIN_SQL);
            await client.query(`DROP SCHEMA ${KEEP_SCHEMA} CASCADE`);
            await client.query('COMMIT');
            return report;
        } catch (error) {
            // On a broken connection ROLLBACK fails too; the server rolls back anyway, and the cause below matters more.
            await client.query('ROLLBACK').catch(() => {});
            throw new Error(`carrying the kept private rows back failed; they stay in the schema ${KEEP_SCHEMA}, and the next \`seed reset\` carries them again, or \`seed reset --drop-private\` discards them`, { cause: error });
        }
    });
}
