import { z } from 'zod';
import { administrativeBodyTypeSchema } from './administrativeBody';
import type { Location } from '@/lib/search/types';

/**
 * A point and a radius in metres: the search's Location. The public API, the
 * search() Server Action and the response spec share it, so a point the
 * Elasticsearch geo query would reject cannot reach it from any of them.
 */
export const searchLocationSchema = z.object({
    point: z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180)
    }).strict(),
    radiusMeters: z.number().positive().max(100_000)
}).strict() satisfies z.ZodType<Location>;

// Strict at every level: a key the API does not take is a 400. Stripped
// silently, a filter under an old name (`adminBodyTypes`) or a point spelled
// `lon` would widen the search and still answer 200.
export const searchRequestSchema = z.object({
    query: z.string().min(1),
    cityIds: z.array(z.string()).optional(),
    personIds: z.array(z.string()).optional(),
    partyIds: z.array(z.string()).optional(),
    administrativeBodyIds: z.array(z.string()).optional()
        .describe('Keep subjects from meetings of these administrative bodies. With `administrativeBodyTypes` also set, a subject must match both'),
    administrativeBodyTypes: z.array(administrativeBodyTypeSchema).optional()
        .describe('Keep subjects from meetings of administrative bodies of these types'),
    topicIds: z.array(z.string()).optional(),
    dateRange: z.object({
        start: z.string().datetime(),
        end: z.string().datetime()
    }).strict().optional(),
    location: searchLocationSchema
        .extend({ radiusMeters: searchLocationSchema.shape.radiusMeters.default(5_000) })
        .optional()
        .describe('Restrict to subjects pinned within `radiusMeters` (metres) of `point`. A subject without a location pin does not match'),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(10),
    detailed: z.boolean().default(false)
}).strict();
