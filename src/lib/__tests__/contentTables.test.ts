import { readFileSync } from "fs";
import path from "path";

/**
 * scripts/content_tables.sh drives two destructive-adjacent operations:
 * copy_db.sh deletes every listed table from the target before it copies, and
 * setup_db_role.sh names every listed table in a single GRANT. A list that has
 * drifted from the schema therefore fails late — copy_db.sh aborts after the
 * delete loop has already emptied the target.
 *
 * These invariants are derived from prisma/schema.prisma, so they need no
 * hand-maintained copy of the model list.
 */

const ROOT = path.join(__dirname, "..", "..", "..");

type Relation = { target: string; optional: boolean };

function parseSchema(schema: string): Map<string, Relation[]> {
    const models = new Map<string, Relation[]>();
    const modelPattern = /^model (\w+) \{([\s\S]*?)^\}/gm;

    for (const model of schema.matchAll(modelPattern)) {
        const [, name, body] = model;
        const relations: Relation[] = [];

        for (const line of body.split("\n")) {
            // Only the side that holds the foreign key declares `fields:`.
            // The back-relation on the other side implies no dependency.
            const relation = line.match(/^\s*\w+\s+(\w+)(\?|\[\])?\s+@relation\(.*fields:\s*\[/);
            if (relation) {
                relations.push({ target: relation[1], optional: relation[2] === "?" });
            }
        }

        models.set(name, relations);
    }

    return models;
}

function parseContentTables(script: string): string[] {
    const body = script.match(/CONTENT_TABLES=\(([\s\S]*?)\)/);
    if (!body) throw new Error("CONTENT_TABLES array not found in content_tables.sh");
    return [...body[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

const models = parseSchema(readFileSync(path.join(ROOT, "prisma", "schema.prisma"), "utf8"));
const contentTables = parseContentTables(readFileSync(path.join(ROOT, "scripts", "content_tables.sh"), "utf8"));
const contentSet = new Set(contentTables);
const position = new Map(contentTables.map((table, index) => [table, index]));

describe("content_tables.sh", () => {
    it("parses a non-empty list", () => {
        expect(contentTables.length).toBeGreaterThan(0);
        expect(models.size).toBeGreaterThan(0);
    });

    it("lists no table that the schema does not define", () => {
        // A dropped model left in the list makes copy_db.sh delete every table
        // before it, then abort on the missing relation, restoring nothing.
        const undefinedTables = contentTables.filter((table) => !models.has(table));
        expect(undefinedTables).toEqual([]);
    });

    it("places every table after the content tables it references", () => {
        // copy_db.sh inserts in list order, so a referenced table must exist first.
        const violations: string[] = [];

        for (const table of contentTables) {
            for (const relation of models.get(table) ?? []) {
                const target = position.get(relation.target);
                const self = position.get(table);
                if (target === undefined || self === undefined) continue;
                if (relation.target !== table && target > self) {
                    violations.push(`${table} references ${relation.target}, which is listed later`);
                }
            }
        }

        expect(violations).toEqual([]);
    });

    it("keeps every required foreign key inside the copy set", () => {
        // copy_db.sh NULLs foreign keys that point outside the set. It cannot do
        // that for a non-nullable column, so it aborts — after --clear has run.
        const violations: string[] = [];

        for (const table of contentTables) {
            for (const relation of models.get(table) ?? []) {
                if (!relation.optional && !contentSet.has(relation.target)) {
                    violations.push(`${table} requires ${relation.target}, which is not copied`);
                }
            }
        }

        expect(violations).toEqual([]);
    });
});
