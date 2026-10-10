import * as z from 'zod';
import { ErrorResponseSchema, type Paths } from '../registry';

// --- Response Schemas ---
// Mirrors the UtteranceContext / UtteranceContextNeighbor types returned by
// getUtteranceContext() (src/lib/db/utteranceContext.ts).

const UtteranceContextNeighborSchema = z.object({
    id: z.string(),
    text: z.string(),
    start: z.number(),
    end: z.number(),
    speakerTagId: z.string(),
}).meta({ id: 'UtteranceContextNeighbor' });

const UtteranceContextSchema = z.object({
    meeting: z.object({
        id: z.string(),
        cityId: z.string(),
        name: z.string(),
        dateTime: z.string(),
    }),
    before: z.array(UtteranceContextNeighborSchema),
    after: z.array(UtteranceContextNeighborSchema),
}).meta({ id: 'UtteranceContext' });

// --- Routes ---

export const utterancesPaths: Paths = {
    '/api/utterance/{utteranceId}/context': {
        get: {
            summary: 'Get utterance context (neighbors)',
            description:
                'Returns N utterances immediately before and after the target utterance within the same '
                + 'meeting, crossing speaker segments. Designed for transcript review tools that already have '
                + 'the target utterance locally and only need surrounding context.',
            tags: ['Utterances'],
            // The handler parses these by hand, so the spec declares them.
            requestParams: {
                path: z.object({
                    utteranceId: z.string().meta({ description: 'Utterance ID' }),
                }),
                query: z.object({
                    before: z.string().optional().meta({ description: 'Utterances to include before the target (integer 0-50)', example: '10' }),
                    after: z.string().optional().meta({ description: 'Utterances to include after the target (integer 0-50)', example: '10' }),
                }),
            },
            responses: {
                200: {
                    description: 'Utterance context',
                    content: { 'application/json': { schema: UtteranceContextSchema } },
                },
                400: {
                    description: 'Invalid before/after parameter',
                    content: { 'application/json': { schema: ErrorResponseSchema } },
                },
                404: {
                    description: 'Utterance not found',
                    content: { 'application/json': { schema: ErrorResponseSchema } },
                },
                500: {
                    description: 'Server error',
                    content: { 'application/json': { schema: ErrorResponseSchema } },
                },
            },
        },
    },
};
