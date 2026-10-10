import * as z from 'zod';

/** JSON body of POST /admin/api-keys. */
export const createApiKeySchema = z.object({
    name: z.string().min(1).max(100).trim(),
});
