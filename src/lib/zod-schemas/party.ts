import * as z from 'zod';

// Field rules of a party — validation only, no defaults. Shared by the party
// form, the party routes, and the city import (zod-schemas/cityPopulation.ts).
export const basePartyFields = {
    name: z.string().min(2, {
        error: "Party name must be at least 2 characters.",
    }),
    name_en: z.string().min(2, {
        error: "Party name (English) must be at least 2 characters.",
    }),
    name_short: z.string().min(2, {
        error: "Short name must be at least 2 characters.",
    }),
    name_short_en: z.string().min(2, {
        error: "Short name (English) must be at least 2 characters.",
    }),
    colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, {
        error: "Color must be a hex code such as #1A73E8.",
    }),
};

// Frontend form schema (React Hook Form)
export const partyFormSchema = z.object({
    ...basePartyFields,
    logo: z.instanceof(File).optional(),
});

export type PartyFormValues = z.infer<typeof partyFormSchema>;
export type PartyFormInput = z.input<typeof partyFormSchema>;

// FormData body of POST /parties and PUT /parties/{partyId}
export const partyFormDataSchema = z.object({
    ...basePartyFields,
    logo: z.instanceof(File).optional(),
    // PUT only: remove the current logo when no new one is sent
    removeLogo: z.string().optional().transform(val => val === 'true'),
});
