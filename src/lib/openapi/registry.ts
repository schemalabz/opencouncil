import * as z from 'zod';
import {
    createDocument,
    type ZodOpenApiObject,
    type ZodOpenApiOperationObject,
    type ZodOpenApiOverride,
} from 'zod-openapi';
import type { AccessLevel } from '@/lib/utils/openapi';

// Session-based auth used by Next.js/NextAuth.
const SESSION_AUTH = 'sessionAuth';
export const sessionAuthRequirement = [{ [SESSION_AUTH]: [] }];

// Reusable error schemas
export const ValidationErrorSchema = z.object({
    error: z.array(z.object({
        code: z.string(),
        message: z.string(),
        path: z.array(z.string().or(z.number())).optional(),
    })),
}).meta({ id: 'ValidationError' });

export const ErrorResponseSchema = z.object({
    error: z.string(),
}).meta({ id: 'ErrorResponse' });

// A 400 that names the problem and lists the zod issues.
export const InvalidRequestSchema = z.object({
    error: z.string(),
    details: ValidationErrorSchema.shape.error,
}).meta({ id: 'InvalidRequest' });

// Simple `{ message }` response shared by delete endpoints.
export const MessageSchema = z.object({
    message: z.string(),
}).meta({ id: 'Message' });

// `{ success: true }`, the response of several admin writes.
export const SuccessSchema = z.object({
    success: z.literal(true),
}).meta({ id: 'Success' });

// Path parameters, shared by the route files.
export const cityIdParam = z.object({
    cityId: z.string().meta({ description: 'City ID', example: 'athens' }),
});

export const meetingIdParam = cityIdParam.extend({
    meetingId: z.string().meta({ description: 'Meeting ID' }),
});

export type Operation = ZodOpenApiOperationObject & { 'x-access-level'?: AccessLevel };
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
export type Paths = Record<string, Partial<Record<Method, Operation>>>;

/** Merge the path objects of several route files; two files may document different methods of one path. */
export function mergePaths(...groups: Paths[]): Paths {
    const merged: Paths = {};
    for (const group of groups) {
        for (const [path, item] of Object.entries(group)) {
            for (const method of Object.keys(item) as Method[]) {
                if (merged[path]?.[method]) throw new Error(`OpenAPI: ${method.toUpperCase()} ${path} is documented twice`);
            }
            merged[path] = { ...merged[path], ...item };
        }
    }
    return merged;
}

// The handlers return Prisma payloads without parsing them, so they do not
// strip a key that a response schema leaves out. An output object therefore
// must not claim `additionalProperties: false`, which zod sets for a
// non-strict object in the output context. A z.strictObject keeps it.
// zod gives every .int() the safe-integer range, which tells a reader nothing.
const overrideSchema: ZodOpenApiOverride = ({ jsonSchema, zodSchema, io }) => {
    const def = zodSchema._zod.def;
    if (io === 'output' && def.type === 'object' && !('catchall' in def && def.catchall)) {
        delete jsonSchema.additionalProperties;
    }
    if (jsonSchema.maximum === Number.MAX_SAFE_INTEGER) delete jsonSchema.maximum;
    if (jsonSchema.minimum === Number.MIN_SAFE_INTEGER) delete jsonSchema.minimum;
};

export function generateDocument(paths: Paths) {
    const document: ZodOpenApiObject = {
        openapi: '3.1.0',
        info: {
            title: 'OpenCouncil API',
            version: '1.0.0',
            description: 'API for OpenCouncil — a platform for transparent local government. '
                + 'This spec is auto-generated from Zod schemas used in the source code.',
        },
        servers: [
            { url: '/', description: 'Current environment' },
        ],
        components: {
            securitySchemes: {
                [SESSION_AUTH]: {
                    type: 'apiKey',
                    in: 'cookie',
                    name: 'authjs.session-token',
                    description: 'Session-based authentication via Auth.js. Sign in at /sign-in to obtain a session cookie.',
                },
            },
            schemas: {
                ValidationError: ValidationErrorSchema,
                ErrorResponse: ErrorResponseSchema,
                Message: MessageSchema,
            },
        },
        paths,
    };
    return createDocument(document, { override: overrideSchema });
}
