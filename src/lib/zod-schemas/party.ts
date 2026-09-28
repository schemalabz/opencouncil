import { z } from 'zod';

// Field rules of a party — validation only, no defaults. Shared by the party
// form, the party routes, and the city import (zod-schemas/cityPopulation.ts).
export const basePartyFields = {
    name: z.string().min(2, {
        message: "Party name must be at least 2 characters.",
    }),
    name_en: z.string().min(2, {
        message: "Party name (English) must be at least 2 characters.",
    }),
    name_short: z.string().min(2, {
        message: "Short name must be at least 2 characters.",
    }),
    name_short_en: z.string().min(2, {
        message: "Short name (English) must be at least 2 characters.",
    }),
    colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, {
        message: "Color must be a hex code such as #1A73E8.",
    }),
};

// Frontend form schema (React Hook Form)
export const partyFormSchema = z.object({
    ...basePartyFields,
    logo: z.instanceof(File).optional(),
});

export type PartyFormValues = z.infer<typeof partyFormSchema>;
