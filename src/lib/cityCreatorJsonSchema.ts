import * as z from 'zod';
import { stripSafeIntBounds } from '@/lib/openapi/jsonSchemaBounds';

/**
 * The JSON Schema of a zod schema, for a reader that is not zod: the prompt
 * of the City Creator. It describes the input, so a field that a transform
 * turns into a Date shows as the string that the caller sends. The MCP SDK
 * does not use it: it converts a zod schema itself, also with io 'input'.
 *
 * The prompt pays for every token of the schema, so the output drops keywords
 * that tell the model nothing: the regex that zod adds next to a `format`
 * (the format already names the rule), and the ±2^53-1 bounds of `.int()`.
 * A `pattern` with no `format`, such as the #RRGGBB color, stays.
 */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
    const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema, {
        io: 'input',
        unrepresentable: 'any',
        override: ({ jsonSchema: node }) => {
            if (node.format !== undefined) delete node.pattern;
            stripSafeIntBounds(node);
        },
    });
    return jsonSchema;
}
