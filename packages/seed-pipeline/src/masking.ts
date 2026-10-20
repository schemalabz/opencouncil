import { MaskingRule } from './tables';
import { quoteIdent } from './normalize';

function literal(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/** A PostgreSQL text[] literal. Every element is double-quoted, so `,`, `{`, and `}` stay inside it. */
function textArrayLiteral(elements: string[]): string {
    const quoted = elements.map((e) => `"${e.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
    return literal(`{${quoted.join(',')}}`);
}

type ColumnRule = Exclude<MaskingRule, { action: 'delete-when' }>;

/**
 * The JSON actions serve a text column that holds JSON (TaskStatus bodies) and a
 * jsonb column (AdministrativeBody.decisionConventions). Each reads the column as
 * text for the validity test, and writes a jsonb value, which Postgres assigns to
 * a text column through its text form.
 */
function jsonOf(column: string): string {
    return `${column}::jsonb`;
}

/** The elements of the array at `path`, numbered, for an UPDATE that rebuilds the array in its order. */
function arrayElements(column: string, path: string[]): string {
    return `jsonb_array_elements(${jsonOf(column)} #> ${textArrayLiteral(path)}) WITH ORDINALITY AS a(e, n)`;
}

/** The WHERE fragment that selects rows the rule still needs to change. */
function pendingCondition(rule: MaskingRule): string {
    if (rule.action === 'delete-when') return `(${rule.when})`;
    const column = quoteIdent(rule.column);
    switch (rule.action) {
        case 'set-null':
            return `${column} IS NOT NULL`;
        case 'empty-array':
            return `${column} IS NOT NULL AND ${column} <> '{}'`;
        case 'json-remove-key':
            // Failed tasks store their error text in these columns (e.g. TaskStatus.requestBody
            // and .responseBody), and a value that is not JSON cannot carry the key.
            // pg_input_is_valid (PostgreSQL 16+) filters those rows out before the ::jsonb cast runs.
            return `${column} IS NOT NULL AND pg_input_is_valid(${column}::text, 'jsonb') AND ${jsonOf(column)} ? ${literal(rule.key)}`;
        case 'json-remove-path':
            // The same guard as json-remove-key.
            return `${column} IS NOT NULL AND pg_input_is_valid(${column}::text, 'jsonb') AND (${jsonOf(column)} #> ${textArrayLiteral(rule.path)}) IS NOT NULL`;
        case 'json-remove-array-key':
            // jsonb_typeof guards the elements: `?` on a JSON string tests its value, not a key.
            return `${column} IS NOT NULL AND pg_input_is_valid(${column}::text, 'jsonb') AND jsonb_typeof(${jsonOf(column)} #> ${textArrayLiteral(rule.path)}) = 'array'`
                + ` AND EXISTS (SELECT 1 FROM ${arrayElements(column, rule.path)} WHERE jsonb_typeof(e) = 'object' AND e ? ${literal(rule.key)})`;
        case 'null-when':
            return `(${rule.when}) AND ${column} IS NOT NULL`;
    }
}

function newValue(rule: ColumnRule): string {
    const column = quoteIdent(rule.column);
    switch (rule.action) {
        case 'set-null':
        case 'null-when':
            return 'NULL';
        case 'empty-array':
            return "'{}'";
        case 'json-remove-key':
            return `(${jsonOf(column)} - ${literal(rule.key)})`;
        case 'json-remove-path':
            return `(${jsonOf(column)} #- ${textArrayLiteral(rule.path)})`;
        case 'json-remove-array-key':
            return `jsonb_set(${jsonOf(column)}, ${textArrayLiteral(rule.path)}, (SELECT jsonb_agg(CASE WHEN jsonb_typeof(e) = 'object' THEN e - ${literal(rule.key)} ELSE e END ORDER BY n) FROM ${arrayElements(column, rule.path)}))`;
    }
}

/**
 * Rows of these tables that a rule may skip, as SQL conditions per table. The
 * subset-only rules only need the rows of the selected meetings, because the
 * subset dump reads no other row and they run after the full dump.
 */
export type RuleScope = Partial<Record<string, string>>;

/**
 * One UPDATE that removes several top-level keys from one JSON text column.
 * A row whose text does not contain `"key"` cannot hold the key, so the LIKE
 * test skips it before the JSON parse, which costs most of the time on 2 GB of
 * task bodies. A key written with JSON escapes would pass the LIKE test
 * unseen; `maskingCheckSql` has no such test, so `verify` reports that row.
 */
function removeJsonKeysSql(table: string, column: string, keys: string[], scope?: string): string {
    const col = quoteIdent(column);
    const removals = keys.map((key) => ` - ${literal(key)}`).join('');
    const mention = keys.map((key) => `${col}::text LIKE ${literal(`%"${key}"%`)}`).join(' OR ');
    const has = keys.length === 1 ? `${jsonOf(col)} ? ${literal(keys[0])}` : `${jsonOf(col)} ?| ${textArrayLiteral(keys)}::text[]`;
    const where = `${col} IS NOT NULL AND (${mention}) AND pg_input_is_valid(${col}::text, 'jsonb') AND ${has}${scope ? ` AND (${scope})` : ''}`;
    return `UPDATE public.${quoteIdent(table)} SET ${col} = (${jsonOf(col)}${removals}) WHERE ${where};`;
}

export function maskingSql(rule: MaskingRule, scope?: string): string {
    const scoped = (where: string) => (scope ? `${where} AND (${scope})` : where);
    if (rule.action === 'delete-when') return `DELETE FROM public.${quoteIdent(rule.table)} WHERE ${scoped(pendingCondition(rule))};`;
    if (rule.action === 'json-remove-key') return removeJsonKeysSql(rule.table, rule.column, [rule.key], scope);
    if (rule.action === 'json-remove-array-key') {
        // As in removeJsonKeysSql: the LIKE test skips a row before the JSON parse.
        const mention = `${quoteIdent(rule.column)}::text LIKE ${literal(`%"${rule.key}"%`)}`;
        return `UPDATE public.${quoteIdent(rule.table)} SET ${quoteIdent(rule.column)} = ${newValue(rule)} WHERE ${scoped(`${mention} AND ${pendingCondition(rule)}`)};`;
    }
    return `UPDATE public.${quoteIdent(rule.table)} SET ${quoteIdent(rule.column)} = ${newValue(rule)} WHERE ${scoped(pendingCondition(rule))};`;
}

export function maskingCheckSql(rule: MaskingRule): string {
    return `SELECT count(*)::text AS n FROM public.${quoteIdent(rule.table)} WHERE ${pendingCondition(rule)}`;
}

/**
 * The statements of `rules`, in their order. The json-remove-key rules of one
 * column become one UPDATE, at the place of the first of them, so the column
 * is read once instead of once per key.
 */
export function applyRules(rules: MaskingRule[], scope: RuleScope = {}): string[] {
    const statements: string[] = [];
    const merged = new Set<string>();
    for (const rule of rules) {
        if (rule.action !== 'json-remove-key') {
            statements.push(maskingSql(rule, scope[rule.table]));
            continue;
        }
        const id = `${rule.table}.${rule.column}`;
        if (merged.has(id)) continue;
        merged.add(id);
        const keys = rules.flatMap((r) => (r.action === 'json-remove-key' && r.table === rule.table && r.column === rule.column ? [r.key] : []));
        statements.push(removeJsonKeysSql(rule.table, rule.column, keys, scope[rule.table]));
    }
    return statements;
}
