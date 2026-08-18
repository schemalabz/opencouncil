import schema from '../../../../elasticsearch/schema.json';
import pipeline from '../../../../elasticsearch/pipeline.json';

// Invariants over the PGSync schema that have each broken production once.
// Grow this file one test per incident, not into a general schema linter.

interface SchemaNode {
    table: string;
    base_tables?: string[];
    children?: SchemaNode[];
}

const root = schema[0].nodes as SchemaNode;

function childNodes(node: SchemaNode): SchemaNode[] {
    const children = node.children ?? [];
    return children.flatMap(child => [child, ...childNodes(child)]);
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

    test('the referenced ingest pipeline is the one defined in the repository', () => {
        // schema.json names the pipeline; pipeline.json defines it. If the
        // names drift apart, every bulk write fails at deploy with a
        // missing-pipeline error.
        expect(schema[0].pipeline).toBe('strip-refs');
        expect(pipeline.processors.length).toBeGreaterThan(0);
    });
});
