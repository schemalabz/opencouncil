import * as z from 'zod';
import { sessionAuthRequirement, meetingIdParam, editAuthResponses, errorResponseOf, invalidRequestResponse, type Paths } from '@/lib/openapi/registry';
import { decisionActionSchema, decisionUpsertSchema } from '@/lib/zod-schemas/decision';

// The validation schemas of the handlers.
const DecisionUpsertSchema = decisionUpsertSchema.meta({ id: 'DecisionUpsert' });
const DecisionActionSchema = decisionActionSchema.meta({ id: 'DecisionAction' });

// A write that conflicts with the decisions already stored. `code` names the
// cause (see DecisionWriteCauseCode), so a client does not read the sentence.
const DecisionWriteFailureSchema = z.object({
    error: z.string(),
    code: z.string(),
    subjectId: z.string().optional().meta({ description: 'The subject that already holds the ΑΔΑ, when the server named it.' }),
}).meta({ id: 'DecisionWriteFailure' });

const subjectNotFound = errorResponseOf('The subject is not in this meeting');

export const decisionsPaths: Paths = {
    '/api/cities/{cityId}/meetings/{meetingId}/decisions': {
        put: {
            summary: 'Link a decision to a subject',
            description: 'Creates or replaces the decision of a subject of the meeting. Requires admin authorization for the city.',
            tags: ['Decisions'],
            security: sessionAuthRequirement,
            requestParams: { path: meetingIdParam },
            requestBody: {
                required: true,
                content: { 'application/json': { schema: DecisionUpsertSchema } },
            },
            responses: {
                200: { description: 'The saved decision' },
                400: invalidRequestResponse('Invalid decision'),
                ...editAuthResponses,
                404: subjectNotFound,
                409: {
                    description: 'The ΑΔΑ is already linked to another subject',
                    content: { 'application/json': { schema: DecisionWriteFailureSchema } },
                },
            },
            'x-access-level': 'admin',
        },
        post: {
            summary: 'Act on the decisions of a meeting',
            description: 'Runs one action, chosen by `action`. Requires admin authorization for the city. '
                + '`clearExtractedData` and `resetExtraction` also require superadmin access.',
            tags: ['Decisions'],
            security: sessionAuthRequirement,
            requestParams: { path: meetingIdParam },
            requestBody: {
                required: true,
                content: { 'application/json': { schema: DecisionActionSchema } },
            },
            responses: {
                200: {
                    description: '`{ "success": true }` for the candidate and extraction actions. '
                        + '`clearExtractedData` returns `{ "clearedCount": n }`, and `rederive` the derivation result.',
                },
                400: invalidRequestResponse('Invalid action'),
                401: editAuthResponses[401],
                403: errorResponseOf('Not authorized to edit, or the action requires superadmin access'),
                404: subjectNotFound,
                409: {
                    description: 'The candidate action conflicts with the stored decisions',
                    content: { 'application/json': { schema: DecisionWriteFailureSchema } },
                },
            },
            'x-access-level': 'admin',
        },
    },
};
