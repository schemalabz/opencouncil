import * as z from 'zod';

/** JSON body of POST /revalidate: the cache tags and paths to revalidate. */
export const revalidateRequestSchema = z.object({
    tags: z.array(z.string()).optional(),
    paths: z.array(z.object({
        path: z.string(),
        type: z.enum(['page', 'layout']).optional()
    })).optional()
});
