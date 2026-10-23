import * as z from 'zod';

// The render options travel to the task server, where `socialOptions` lands
// in an ffmpeg filter graph as text. Only the shapes the renderer defines
// pass: an enum, a 6-digit hex color, a number in the renderer's range.
// Unknown keys are rejected so that a new field cannot reach the task server
// unreviewed. This module has no server imports so that a route test can load
// it without the database.
export const generateHighlightOptionsSchema = z.strictObject({
    includeCaptions: z.boolean().optional(),
    includeSpeakerOverlay: z.boolean().optional(),
    aspectRatio: z.enum(['default', 'social-9x16']).optional(),
    socialOptions: z.strictObject({
        marginType: z.enum(['blur', 'solid']).optional(),
        backgroundColor: z.string().regex(/^#?[0-9a-fA-F]{6}$/, 'must be a 6-digit hex color').optional(),
        zoomFactor: z.number().min(0.6).max(1.0).optional(),
    }).optional(),
    force: z.boolean().optional(),
});
