import * as z from 'zod';
import { sessionAuthRequirement, editAuthResponses, errorResponseOf, invalidRequestResponse, type Operation, type Paths } from '@/lib/openapi/registry';
import { productUpdateSendSchema } from '@/lib/zod-schemas/productUpdate';
import { revalidateRequestSchema } from '@/lib/zod-schemas/revalidate';
import { createTopicSchema, updateTopicSchema } from '@/lib/zod-schemas/topic';
import { createUserRequestSchema, updateAdminUserSchema } from '@/lib/zod-schemas/user';

// The superadmin routes. filterSpecByAccessLevel hides them, and the
// schemas only they use, from every other viewer.

const RevalidateRequestSchema = revalidateRequestSchema.meta({ id: 'RevalidateRequest' });
const ProductUpdateSendSchema = productUpdateSendSchema.meta({ id: 'ProductUpdateSend' });
const CreateTopicSchema = createTopicSchema.meta({ id: 'CreateTopic' });
const UpdateTopicSchema = updateTopicSchema.meta({ id: 'UpdateTopic' });
const CreateUserRequestSchema = createUserRequestSchema.meta({ id: 'CreateAdminUser' });
const UpdateAdminUserSchema = updateAdminUserSchema.meta({ id: 'UpdateAdminUser' });

const RevalidateResultSchema = z.object({
    revalidated: z.literal(true),
    tags: z.array(z.string()),
    paths: z.array(z.string()),
    timestamp: z.iso.datetime(),
}).meta({ id: 'RevalidateResult' });

const ProductUpdateResultSchema = z.object({
    sent: z.number().int(),
    failed: z.number().int(),
    failedEmails: z.array(z.string()),
}).meta({ id: 'ProductUpdateResult' });

const invalidBody = invalidRequestResponse('Invalid request body');

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
                400: invalidBody,
                ...editAuthResponses,
                500: errorResponseOf('Server error'),
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
                ...editAuthResponses,
                500: errorResponseOf('Server error'),
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
                ...editAuthResponses,
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
                ...editAuthResponses,
            },
        },
    },
    '/api/admin/users': {
        post: {
            ...adminOperation,
            summary: 'Invite a user, or create a machine account',
            description: 'Creates a user and sends the invitation email. When the email fails, the response '
                + 'carries a `warning` and the user stays created. With `isMachine: true` it creates a machine '
                + 'account from `label` instead: no invitation, and the address comes from the label.',
            requestBody: {
                required: true,
                content: { 'application/json': { schema: CreateUserRequestSchema } },
            },
            responses: {
                200: { description: 'The created user or machine account' },
                400: invalidBody,
                409: errorResponseOf('A user with this email, or a machine account with this label, already exists'),
                ...editAuthResponses,
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
                ...editAuthResponses,
            },
        },
    },
};
