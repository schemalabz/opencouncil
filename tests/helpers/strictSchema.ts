import * as z from 'zod';

/**
 * The same schema with every object strict, at every depth. A documented
 * response schema is not strict, because the handlers do not strip unknown
 * keys; a test that parses a real response with this version fails on a key
 * that the spec does not document.
 */
export function strictSchema(schema: z.core.$ZodType): z.core.$ZodType {
    if (schema instanceof z.ZodObject) {
        const shape: Record<string, z.core.$ZodType> = {};
        for (const [key, value] of Object.entries(schema.shape)) shape[key] = strictSchema(value);
        return z.strictObject(shape);
    }
    if (schema instanceof z.ZodArray) return z.array(strictSchema(schema.element));
    if (schema instanceof z.ZodNullable) return z.nullable(strictSchema(schema.unwrap()));
    if (schema instanceof z.ZodOptional) return z.optional(strictSchema(schema.unwrap()));
    if (schema instanceof z.ZodUnion) return z.union(schema.options.map(strictSchema));
    return schema;
}
