import fs from 'fs';
import path from 'path';
import schema from '../../../../elasticsearch/schema.json';
import pipeline from '../../../../elasticsearch/pipeline.json';

// Invariants over the PGSync schema that have each broken production once.
// Grow this file one test per incident, not into a general schema linter.
// The rules behind them are in elasticsearch/README.md, "What syncs live".

interface SchemaNode {
    table: string;
    base_tables?: string[];
    primary_key?: string[];
    relationship?: { foreign_key?: { parent?: string[]; child?: string[] } };
    children?: SchemaNode[];
}

const root = schema[0].nodes as SchemaNode;

function childNodes(node: SchemaNode): SchemaNode[] {
    const children = node.children ?? [];
    return children.flatMap(child => [child, ...childNodes(child)]);
}

/** A node backed by a view: PGSync takes its live events from its base_tables. */
const viewNodes = childNodes(root).filter(node => (node.base_tables ?? []).length > 0);

/**
 * PGSync relabels every event of a base table as an event of the LAST node, in
 * breadth-first order, that lists the table in base_tables (on_publish in
 * pgsync/sync.py). The child nodes here are one level deep, so that is schema
 * order.
 */
function eventRoute(): Map<string, SchemaNode> {
    const route = new Map<string, SchemaNode>();
    for (const node of childNodes(root)) {
        for (const table of node.base_tables ?? []) route.set(table, node);
    }
    return route;
}

// Without its -- comments: a comment may hold a semicolon, which would end a
// view definition early.
const viewsSql = fs
    .readFileSync(path.join(__dirname, '../../../../elasticsearch/views.sql'), 'utf8')
    .replace(/--[^\n]*/g, '');

/** The SQL of `CREATE [OR REPLACE] VIEW "name" AS ...;`. */
function viewDefinition(name: string): string {
    const match = viewsSql.match(new RegExp(`CREATE (?:OR REPLACE )?VIEW "${name}" AS([\\s\\S]*?);`));
    if (!match) throw new Error(`views.sql defines no view ${name}`);
    return match[1];
}

/** The table of the view's top-level FROM, outside any subquery. */
function mainFromTable(sql: string): string | undefined {
    let depth = 0;
    for (let i = 0; i < sql.length; i++) {
        if (sql[i] === '(') depth++;
        else if (sql[i] === ')') depth--;
        else if (depth === 0 && /^FROM\s+"(\w+)"/i.test(sql.slice(i))) return sql.slice(i).match(/^FROM\s+"(\w+)"/i)![1];
    }
    return undefined;
}

describe('elasticsearch/schema.json invariants', () => {
    test('no child node lists the root table in base_tables', () => {
        // A child node that claims the root table makes PGSync route root
        // DELETE events as child re-syncs, so deleted documents stay in the
        // index forever. This shipped once, as SubjectSearchView (#346).
        for (const node of childNodes(root)) {
            expect({ table: node.table, base_tables: node.base_tables ?? [] }).not.toEqual(
                expect.objectContaining({ base_tables: expect.arrayContaining([root.table]) }),
            );
        }
    });

    test('every view keys and joins on unaliased base table columns', () => {
        // A WAL event carries the base table's own column names. PGSync looks
        // the view's primary key and foreign key up by name in it, so an alias
        // is never found: IntroducedByPartyView keyed on (person_id, city_id)
        // exited the daemon on every Role or Party write, and
        // SpeakerContributionSearchView joined on subject_id never resolved a
        // new contribution to its subject.
        for (const node of viewNodes) {
            const sql = viewDefinition(node.table);
            const columns = [...(node.primary_key ?? []), ...(node.relationship?.foreign_key?.child ?? [])];
            for (const column of new Set(columns)) {
                expect({ view: node.table, column, aliased: new RegExp(`\\bAS\\s+"?${column}"?\\b`, 'i').test(sql) })
                    .toEqual({ view: node.table, column, aliased: false });
            }
        }
    });

    test('a table with a node of its own routes its events to a view joined the same way', () => {
        // PGSync sends a base table's events to the last view that lists it,
        // even when the table has a node of its own. Listed by
        // SpeakerContributionSearchView, Person renames went to a view keyed by
        // contribution id and changed nothing.
        const route = eventRoute();
        for (const node of childNodes(root).filter(n => !(n.base_tables ?? []).length)) {
            const view = route.get(node.table);
            if (!view) continue;
            expect({ table: node.table, via: view.table, foreign_key: view.relationship?.foreign_key })
                .toEqual({ table: node.table, via: view.table, foreign_key: node.relationship?.foreign_key });
        }
    });

    test('a view built on one table receives that table\'s events', () => {
        // A view whose rows are the rows of one base table resolves that
        // table's events by its own primary key. SubjectMetricsView, listed
        // after SpeakerContributionSearchView, took the SpeakerContribution
        // events instead, keyed them as subject ids, and dropped every new
        // contribution.
        const route = eventRoute();
        for (const node of viewNodes) {
            const from = mainFromTable(viewDefinition(node.table));
            if (!from || !(node.base_tables ?? []).includes(from)) continue;
            expect({ table: from, routedTo: route.get(from)?.table }).toEqual({ table: from, routedTo: node.table });
        }
    });

    test('the referenced ingest pipeline is the one defined in the repository', () => {
        // schema.json names the pipeline; pipeline.json defines it. If the
        // names drift apart, every bulk write fails at deploy with a
        // missing-pipeline error.
        expect(schema[0].pipeline).toBe('strip-refs');
        expect(pipeline.processors.length).toBeGreaterThan(0);
    });
});
