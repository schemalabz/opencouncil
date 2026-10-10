import * as z from 'zod';

/**
 * The JSON Schema of a zod schema, for a reader that is not zod: the prompt
 * of the City Creator. It describes the input, so a field that a transform
 * turns into a Date shows as the string that the caller sends. The MCP SDK
 * does not use it: it converts a zod schema itself, also with io 'input'.
 */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
    const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
    return jsonSchema;
}
