import { ForeignKey } from './foreign-keys';

/**
 * A foreign key as read from pg_constraint, with the parent's primary-key column
 * order. Its `definition` is pg_get_constraintdef() output, which has the same
 * form as the text after ADD CONSTRAINT "<name>" in a dump.
 */
export type CatalogFk = Omit<ForeignKey, 'statement'> & { parentPk: string[] };

export function quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
}

export function nullOrphanColumnsSql(fks: ForeignKey[]): string[] {
    return fks.flatMap((fk) =>
        fk.columns.map((column) => `UPDATE public.${quoteIdent(fk.table)} SET ${quoteIdent(column)} = NULL WHERE ${quoteIdent(column)} IS NOT NULL;`),
    );
}

export function dropConstraintSql(fk: { table: string; constraint: string }): string {
    return `ALTER TABLE public.${quoteIdent(fk.table)} DROP CONSTRAINT ${quoteIdent(fk.constraint)};`;
}

export function addConstraintSql(table: string, constraint: string, definition: string): string {
    return `ALTER TABLE public.${quoteIdent(table)} ADD CONSTRAINT ${quoteIdent(constraint)} ${definition};`;
}

/**
 * Greenmask joins composite keys by position against the parent primary key, so a
 * key declared in a different column order must be re-declared in key order. The
 * constraint is the same; only the column order changes.
 */
export function reorderedDefinition(fk: CatalogFk): string {
    const actions = fk.definition.slice(fk.definition.lastIndexOf(')') + 1).trim();
    const childInPkOrder = fk.parentPk.map((pkColumn) => {
        const position = fk.refColumns.indexOf(pkColumn);
        if (position < 0) throw new Error(`${fk.constraint}: referenced columns ${fk.refColumns.join(',')} do not cover primary key ${fk.parentPk.join(',')}`);
        return fk.columns[position];
    });
    const child = childInPkOrder.map(quoteIdent).join(', ');
    const parent = fk.parentPk.map(quoteIdent).join(', ');
    return `FOREIGN KEY (${child}) REFERENCES public.${quoteIdent(fk.refTable)}(${parent})${actions ? ' ' + actions : ''}`;
}

/**
 * A dropped self-referencing key does not stop the subset from keeping a row whose
 * parent row the subset leaves out. The re-added constraint then fails. This
 * statement nulls every such column value first, so the ADD CONSTRAINT succeeds.
 */
export function nullDanglingSelfReferenceSql(fk: CatalogFk): string {
    if (fk.columns.length !== 1 || fk.refColumns.length !== 1) {
        throw new Error(`${fk.constraint}: a composite self-referencing key is not supported; add a rule for public."${fk.table}" in normalize.ts`);
    }
    const column = quoteIdent(fk.columns[0]);
    const parent = quoteIdent(fk.refColumns[0]);
    const table = `public.${quoteIdent(fk.table)}`;
    return `UPDATE ${table} SET ${column} = NULL WHERE ${column} IS NOT NULL AND ${column} NOT IN (SELECT ${parent} FROM ${table});`;
}

export type NormalizationInput = {
    misordered: CatalogFk[];
    selfReferencing: CatalogFk[];
    explicitQueryFks: CatalogFk[];
};

export type Normalization = { sql: string[]; postRestoreSql: string[] };

export function buildNormalization(input: NormalizationInput): Normalization {
    const sql: string[] = [];
    const postRestoreSql: string[] = [];
    for (const fk of input.misordered) {
        sql.push(dropConstraintSql(fk));
        sql.push(addConstraintSql(fk.table, fk.constraint, reorderedDefinition(fk)));
    }
    for (const fk of input.selfReferencing) {
        sql.push(dropConstraintSql(fk));
        postRestoreSql.push(nullDanglingSelfReferenceSql(fk));
        postRestoreSql.push(addConstraintSql(fk.table, fk.constraint, fk.definition));
    }
    for (const fk of input.explicitQueryFks) {
        sql.push(dropConstraintSql(fk));
        postRestoreSql.push(addConstraintSql(fk.table, fk.constraint, fk.definition));
    }
    sql.push('DROP SCHEMA IF EXISTS aiven_extras CASCADE;');
    return { sql, postRestoreSql };
}

/**
 * Indexes for foreign keys that have none, to create before the delete-when rules
 * and drop before the dumps: production's schema lacks them, so the dumps must too.
 * Without them, every row a cascade deletes scans each child table that points at
 * it with an ON DELETE action.
 */
export function temporaryIndexSql(fks: { table: string; columns: string[] }[]): { create: string[]; drop: string[] } {
    const names = fks.map((_, i) => `seed_tmp_fk_${i}`);
    return {
        create: fks.map((fk, i) => `CREATE INDEX ${quoteIdent(names[i])} ON public.${quoteIdent(fk.table)} (${fk.columns.map(quoteIdent).join(', ')});`),
        drop: names.map((name) => `DROP INDEX public.${quoteIdent(name)};`),
    };
}

/** PGSync's bootstrap installs this trigger function and the materialized view it reads. No Prisma migration creates them. */
export const PGSYNC_TRIGGER_FUNCTION = 'table_notify';
export const PGSYNC_VIEW = '_view';

/** PGSync's change-capture objects as the catalog of one database holds them. */
export type PgSyncObjects = {
    triggers: { schema: string; table: string; trigger: string }[];
    hasFunction: boolean;
    hasView: boolean;
};

/**
 * No consumer of an artifact runs PGSync, and a restored `_view` is not
 * populated, so every write on a synced table would fail. The triggers go
 * first, because they depend on the function. A database without PGSync
 * gives no statements.
 */
export function dropPgSyncSql(objects: PgSyncObjects): string[] {
    return [
        ...objects.triggers.map((t) => `DROP TRIGGER ${quoteIdent(t.trigger)} ON ${quoteIdent(t.schema)}.${quoteIdent(t.table)};`),
        ...(objects.hasFunction ? [`DROP FUNCTION public.${quoteIdent(PGSYNC_TRIGGER_FUNCTION)}();`] : []),
        ...(objects.hasView ? [`DROP MATERIALIZED VIEW public.${quoteIdent(PGSYNC_VIEW)};`] : []),
    ];
}
