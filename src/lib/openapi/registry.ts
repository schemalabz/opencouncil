import * as z from 'zod';
import {
    createDocument,
    type ZodOpenApiObject,
    type ZodOpenApiOperationObject,
    type ZodOpenApiOverride,
} from 'zod-openapi';
import type { AccessLevel } from '@/lib/utils/openapi';
import { errorResponseSchema, lifecycleRuleErrorSchema, validationErrorSchema } from '@/lib/api/errors';
import { stripSafeIntBounds } from './jsonSchemaBounds';

// Each route file documents a request with the zod schema that its handler
// parses. The spec shows the input of that schema: a transformed field shows
// as the string that the caller sends, and a file field shows as binary.

// Session-based auth used by Next.js/NextAuth.
const SESSION_AUTH = 'sessionAuth';
export const sessionAuthRequirement = [{ [SESSION_AUTH]: [] }];

// The error bodies the handlers build (see @/lib/api/errors).
const jsonError = (description: string, schema: z.ZodType) => ({
    description,
    content: { 'application/json': { schema } },
});

/** A 400 for a body or query that fails the zod schema of the handler. */
export const invalidRequestResponse = (description = 'Invalid request') => jsonError(description, validationErrorSchema);

/** A 400 that is a `ValidationError`, or an `ErrorResponse` from a check that the schema does not make. */
export const invalidRequestOrMessageResponse = (description: string) =>
    jsonError(description, z.union([validationErrorSchema, errorResponseSchema]));

/** An `ErrorResponse` with the given description. */
export const errorResponseOf = (description: string) => jsonError(description, errorResponseSchema);

/** A 422 for a meeting write that breaks a lifecycle rule of the record. */
export const lifecycleRuleResponse = jsonError('The write breaks a lifecycle rule of the meeting record', lifecycleRuleErrorSchema);

/**
 * The refusals of withUserAuthorizedToEdit and withServiceOrUserAuth: nobody
 * signed in, or a user without the right to edit.
 */
export const editAuthResponses = {
    401: errorResponseOf('Not signed in'),
    403: errorResponseOf('Not authorized to edit'),
};

/** The refusal of a route that answers 401 both when nobody is signed in and when the user lacks the right. */
export const notAuthorizedResponse = errorResponseOf('Not signed in, or not authorized');

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
const overrideSchema: ZodOpenApiOverride = ({ jsonSchema, zodSchema, io }) => {
    const def = zodSchema._zod.def;
    if (io === 'output' && def.type === 'object' && !('catchall' in def && def.catchall)) {
        delete jsonSchema.additionalProperties;
    }
    stripSafeIntBounds(jsonSchema);
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
                ValidationError: validationErrorSchema,
                ErrorResponse: errorResponseSchema,
                Message: MessageSchema,
            },
        },
        paths,
    };
    return createDocument(document, { override: overrideSchema });
}
