import { z } from 'zod';

export const searchRequestSchema = z.object({
    query: z.string().min(1),
    cityIds: z.array(z.string()).optional(),
    personIds: z.array(z.string()).optional(),
    partyIds: z.array(z.string()).optional(),
    topicIds: z.array(z.string()).optional(),
    dateRange: z.object({
        start: z.string().datetime(),
        end: z.string().datetime()
    }).optional(),
    location: z.object({
        point: z.object({
            lat: z.number(),
            lon: z.number()
        }),
        radius: z.number().min(0).max(100).default(5)
    }).optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(10),
    detailed: z.boolean().default(false)
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;
