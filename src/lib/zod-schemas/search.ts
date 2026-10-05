import { z } from 'zod';
import { administrativeBodyTypeSchema } from './administrativeBody';

export const searchRequestSchema = z.object({
    query: z.string().min(1),
    cityIds: z.array(z.string()).optional(),
    personIds: z.array(z.string()).optional(),
    partyIds: z.array(z.string()).optional(),
    adminBodyIds: z.array(z.string()).optional()
        .describe('Restrict to subjects from meetings of these administrative bodies'),
    adminBodyTypes: z.array(administrativeBodyTypeSchema).optional()
        .describe('Restrict to subjects from meetings of any administrative body of these types'),
    topicIds: z.array(z.string()).optional(),
    dateRange: z.object({
        start: z.string().datetime(),
        end: z.string().datetime()
    }).optional(),
    location: z.object({
        point: z.object({
            lat: z.number().min(-90).max(90),
            lon: z.number().min(-180).max(180)
        }),
        radius: z.number().positive().max(100).default(5).describe('Radius in kilometres')
    }).optional()
        .describe('Restrict to subjects pinned within `radius` of `point`. A subject without a location pin does not match'),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(10),
    detailed: z.boolean().default(false)
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;
