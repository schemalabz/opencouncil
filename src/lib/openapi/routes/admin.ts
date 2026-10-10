import * as z from 'zod';
import { sessionAuthRequirement, ErrorResponseSchema, ValidationErrorSchema, type Operation, type Paths } from '../registry';
import { createApiKeySchema } from '@/lib/zod-schemas/apiKey';
import { productUpdateSendSchema } from '@/lib/zod-schemas/productUpdate';
import { revalidateRequestSchema } from '@/lib/zod-schemas/revalidate';
import { createTopicSchema, updateTopicSchema } from '@/lib/zod-schemas/topic';
import { createAdminUserSchema, updateAdminUserSchema } from '@/lib/zod-schemas/user';

// The superadmin routes. filterSpecByAccessLevel hides them, and the
// schemas only they use, from every other viewer.

// The validation schemas of the handlers.
const RevalidateRequestSchema = revalidateRequestSchema.meta({ id: 'RevalidateRequest' });
const CreateApiKeySchema = createApiKeySchema.meta({ id: 'CreateApiKey' });
const ProductUpdateSendSchema = productUpdateSendSchema.meta({ id: 'ProductUpdateSend' });
const CreateTopicSchema = createTopicSchema.meta({ id: 'CreateTopic' });
const UpdateTopicSchema = updateTopicSchema.meta({ id: 'UpdateTopic' });
const CreateAdminUserSchema = createAdminUserSchema.meta({ id: 'CreateAdminUser' });
const UpdateAdminUserSchema = updateAdminUserSchema.meta({ id: 'UpdateAdminUser' });

const RevalidateResultSchema = z.object({
    revalidated: z.literal(true),
    tags: z.array(z.string()),
    paths: z.array(z.string()),
    timestamp: z.iso.datetime(),
}).meta({ id: 'RevalidateResult' });

// The raw key is in this response only; the server stores its hash.
const CreatedApiKeySchema = z.object({
    id: z.string(),
    name: z.string(),
    keyPrefix: z.string(),
    rawKey: z.string(),
    createdAt: z.iso.datetime(),
}).meta({ id: 'CreatedApiKey' });

const ProductUpdateResultSchema = z.object({
    sent: z.number().int(),
    failed: z.number().int(),
    failedEmails: z.array(z.string()),
}).meta({ id: 'ProductUpdateResult' });

const notSignedIn = {
    description: 'Not signed in',
    content: { 'application/json': { schema: ErrorResponseSchema } },
};

const notSuperadmin = {
    description: 'Not a superadmin',
    content: { 'application/json': { schema: ErrorResponseSchema } },
};

// handleApiError joins the zod issues into one message.
const invalidBody = {
    description: 'Invalid request body',
    content: { 'application/json': { schema: ErrorResponseSchema } },
};

const topicIdParam = z.object({
    topicId: z.string().meta({ description: 'Topic ID' }),
});

const adminOperation: Pick<Operation, 'tags' | 'security' | 'x-access-level'> = {
    tags: ['Admin'],
    security: sessionAuthRequirement,
    'x-access-level': 'superadmin',
};

export const adminPaths: Paths = {
    '/api/revalidate': {
        post: {
            ...adminOperation,
            summary: 'Revalidate cached pages',
            description: 'Revalidates the given cache tags and paths.',
            requestBody: {
                required: true,
                content: { 'application/json': { schema: RevalidateRequestSchema } },
            },
            responses: {
                200: {
                    description: 'The tags and paths that were revalidated',
                    content: { 'application/json': { schema: RevalidateResultSchema } },
                },
                400: {
                    description: 'Invalid request body',
                    content: { 'application/json': { schema: ValidationErrorSchema } },
                },
                401: notSuperadmin,
                500: {
                    description: 'Server error',
                    content: { 'application/json': { schema: ErrorResponseSchema } },
                },
            },
        },
    },
    '/api/admin/api-keys': {
        post: {
            ...adminOperation,
            summary: 'Create a service API key',
            requestBody: {
                required: true,
                content: { 'application/json': { schema: CreateApiKeySchema } },
            },
            responses: {
                201: {
                    description: 'The new key. The response shows the raw key once.',
                    content: { 'application/json': { schema: CreatedApiKeySchema } },
                },
                400: {
                    description: 'Invalid request body',
                    content: { 'application/json': { schema: ValidationErrorSchema } },
                },
                401: notSignedIn,
                403: notSuperadmin,
            },
        },
    },
    '/api/admin/product-updates/send': {
        post: {
            ...adminOperation,
            summary: 'Send a product update email',
            description: 'Sends the email to every user who allows product updates. '
                + 'With `testEmail`, it sends one test email to that address only.',
            requestBody: {
                required: true,
                content: { 'application/json': { schema: ProductUpdateSendSchema } },
            },
            responses: {
                200: {
                    description: 'The counts of sent and failed emails',
                    content: { 'application/json': { schema: ProductUpdateResultSchema } },
                },
                400: invalidBody,
                401: notSignedIn,
                403: notSuperadmin,
                500: {
                    description: 'Server error',
                    content: { 'application/json': { schema: ErrorResponseSchema } },
                },
            },
        },
    },
    '/api/admin/topics': {
        post: {
            ...adminOperation,
            summary: 'Create a topic',
            requestBody: {
                required: true,
                content: { 'application/json': { schema: CreateTopicSchema } },
            },
            responses: {
                200: { description: 'The created topic' },
                400: invalidBody,
            },
        },
    },
    '/api/admin/topics/{topicId}': {
        put: {
            ...adminOperation,
            summary: 'Update a topic',
            requestParams: { path: topicIdParam },
            requestBody: {
                required: true,
                content: { 'application/json': { schema: UpdateTopicSchema } },
            },
            responses: {
                200: { description: 'The updated topic' },
                400: invalidBody,
            },
        },
    },
    '/api/admin/users': {
        post: {
            ...adminOperation,
            summary: 'Invite a user',
            description: 'Creates a user and sends the invitation email. When the email fails, the response '
                + 'carries a `warning` and the user stays created.',
            requestBody: {
                required: true,
                content: { 'application/json': { schema: CreateAdminUserSchema } },
            },
            responses: {
                200: { description: 'The created user' },
                400: invalidBody,
                401: { description: 'Not signed in as a superadmin' },
            },
        },
        put: {
            ...adminOperation,
            summary: 'Update a user',
            requestBody: {
                required: true,
                content: { 'application/json': { schema: UpdateAdminUserSchema } },
            },
            responses: {
                200: { description: 'The updated user' },
                400: invalidBody,
                401: { description: 'Not signed in as a superadmin' },
            },
        },
    },
};
