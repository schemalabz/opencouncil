import { z } from 'zod';
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

/**
 * The JSON Schema of a zod 3 schema, for a reader that is not zod: the prompt
 * of the City Creator and the tool list of the MCP server. An OpenAPI 3.1
 * schema is a JSON Schema. It describes the input, so a field that a transform
 * turns into a Date shows as the string that the caller sends.
 */
export function jsonSchemaOf(schema: z.ZodTypeAny): Record<string, unknown> {
    const registry = new OpenAPIRegistry();
    registry.register('Schema', schema);
    return (new OpenApiGeneratorV31(registry.definitions).generateComponents().components?.schemas?.Schema ?? {}) as Record<string, unknown>;
}
