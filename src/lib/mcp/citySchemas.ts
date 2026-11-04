import * as z from 'zod';
import { CitySchema, AdministrativeBodySchema, PartySchema } from '@/lib/openapi/entities';
import { cityBoundarySummarySchema, cityIdSchema } from '@/lib/zod-schemas/city';
import { webUrl } from '@/lib/zod-schemas/primitives';

export const getCityToolInput = z.strictObject({ cityId: cityIdSchema });

// Compose the existing REST entity fields, without inheriting its OpenAPI
// component id or exposing its full database row and administrative settings.
export const cityProfileSchema = z.object({
    ...CitySchema.pick({
        id: true, name: true, name_en: true, name_municipality: true, name_municipality_en: true,
        authorityType: true, realm: true, status: true, language: true, timezone: true,
    }).shape,
    // Existing MCP alias retained for clients; official names above match REST.
    municipality: CitySchema.shape.name_municipality,
    officialSupport: z.boolean(),
    boundary: cityBoundarySummarySchema.nullable(),
    counts: z.object({ meetings: z.number().int().nonnegative(), people: z.number().int().nonnegative(), parties: z.number().int().nonnegative() }),
    administrativeBodies: z.array(AdministrativeBodySchema.pick({ id: true, name: true, name_en: true, type: true })),
    parties: z.array(PartySchema.pick({ id: true, name: true, name_en: true }).extend({ url: webUrl() })),
    url: webUrl(),
});
export type CityProfile = z.output<typeof cityProfileSchema>;

export const cityChangesSchema = z.strictObject({
    status: z.object({ before: CitySchema.shape.status, after: z.literal('demo') }).optional(),
    boundary: z.object({ before: cityBoundarySummarySchema.nullable(), after: cityBoundarySummarySchema }).optional(),
});
export type CityChanges = z.output<typeof cityChangesSchema>;

export const updateCityResultSchema = z.object({
    city: cityProfileSchema,
    changed: z.boolean(),
    changes: cityChangesSchema,
}).superRefine((result, ctx) => {
    if (result.changed !== (Object.keys(result.changes).length > 0)) {
        ctx.addIssue({ code: 'custom', message: 'changed must agree with changes' });
    }
});
export type UpdateCityResult = z.output<typeof updateCityResultSchema>;
