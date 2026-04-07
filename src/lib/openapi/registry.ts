import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// Security scheme: session-based auth used by Next.js/NextAuth
export const sessionAuth = registry.registerComponent('securitySchemes', 'sessionAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: 'authjs.session-token',
    description: 'Session-based authentication via Auth.js. Sign in at /sign-in to obtain a session cookie.',
});

// Reusable error schemas
export const ValidationErrorSchema = z.object({
    error: z.array(z.object({
        code: z.string(),
        message: z.string(),
        path: z.array(z.string().or(z.number())).optional(),
    })),
}).openapi('ValidationError');

export const ErrorResponseSchema = z.object({
    error: z.string(),
}).openapi('ErrorResponse');

registry.register('ValidationError', ValidationErrorSchema);
registry.register('ErrorResponse', ErrorResponseSchema);

export function generateSpec() {
    const generator = new OpenApiGeneratorV3(registry.definitions);

    return generator.generateDocument({
        openapi: '3.0.3',
        info: {
            title: 'OpenCouncil API',
            version: '1.0.0',
            description: 'API for OpenCouncil — a platform for transparent local government. '
                + 'This spec is auto-generated from Zod schemas used in the source code.',
        },
        servers: [
            { url: '/', description: 'Current environment' },
        ],
    });
}
