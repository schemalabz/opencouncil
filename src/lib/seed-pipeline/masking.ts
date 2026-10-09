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
            return `${column} IS NOT NULL AND pg_input_is_valid(${column}, 'jsonb') AND ${column}::jsonb ? ${literal(rule.key)}`;
        case 'json-remove-path':
            // The same guard as json-remove-key.
            return `${column} IS NOT NULL AND pg_input_is_valid(${column}, 'jsonb') AND (${column}::jsonb #> ${textArrayLiteral(rule.path)}) IS NOT NULL`;
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
            return `(${column}::jsonb - ${literal(rule.key)})::text`;
        case 'json-remove-path':
            return `(${column}::jsonb #- ${textArrayLiteral(rule.path)})::text`;
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
    const mention = keys.map((key) => `${col} LIKE ${literal(`%"${key}"%`)}`).join(' OR ');
    const has = keys.length === 1 ? `${col}::jsonb ? ${literal(keys[0])}` : `${col}::jsonb ?| ${textArrayLiteral(keys)}::text[]`;
    const where = `${col} IS NOT NULL AND (${mention}) AND pg_input_is_valid(${col}, 'jsonb') AND ${has}${scope ? ` AND (${scope})` : ''}`;
    return `UPDATE public.${quoteIdent(table)} SET ${col} = (${col}::jsonb${removals})::text WHERE ${where};`;
}

export function maskingSql(rule: MaskingRule, scope?: string): string {
    const scoped = (where: string) => (scope ? `${where} AND (${scope})` : where);
    if (rule.action === 'delete-when') return `DELETE FROM public.${quoteIdent(rule.table)} WHERE ${scoped(pendingCondition(rule))};`;
    if (rule.action === 'json-remove-key') return removeJsonKeysSql(rule.table, rule.column, [rule.key], scope);
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
