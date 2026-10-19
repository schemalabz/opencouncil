import * as z from 'zod';

// Resend tag-value rules: ASCII letters/digits/underscores/dashes, ≤ 256 chars.
const tagValue = z.string().regex(/^[A-Za-z0-9_-]+$/).max(256);

/** JSON body of POST /admin/product-updates/send. With testEmail, it sends one test email only. */
export const productUpdateSendSchema = z.object({
    subject: z.string().trim().min(1).max(200),
    bodyHtml: z.string().trim().min(1),
    testEmail: z.email().optional(),
    testName: z.string().max(120).optional(),
    tags: z.array(tagValue).max(70).optional(),
});
