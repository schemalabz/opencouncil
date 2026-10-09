import * as z from 'zod';

/**
 * The JSON Schema of a zod schema, for a prompt: the model that reads a
 * pasted list of the members of a body (src/lib/bodyRosterText.ts) gets the
 * shape of its answer from it. It describes the input, so a field that a
 * transform turns into a Date shows as the string that the caller sends.
 *
 * The prompt pays for every token of the schema, so the output drops keywords
 * that tell the model nothing: the regex that zod adds next to a `format`
 * (the format already names the rule), and the ±2^53-1 bounds of `.int()`.
 * A `pattern` with no `format` stays.
 */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
    const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema, {
        io: 'input',
        unrepresentable: 'any',
        override: ({ jsonSchema: node }) => {
            if (node.format !== undefined) delete node.pattern;
            if (node.maximum === Number.MAX_SAFE_INTEGER) delete node.maximum;
            if (node.minimum === Number.MIN_SAFE_INTEGER) delete node.minimum;
        },
    });
    return jsonSchema;
}
