import * as z from 'zod';
import { logoFile, stringBoolean } from './primitives';

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
    logo: z.file().optional(),
});

export type PartyFormOutput = z.output<typeof partyFormSchema>;
export type PartyFormInput = z.input<typeof partyFormSchema>;

// FormData body of POST /parties and PUT /parties/{partyId}
export const partyFormDataSchema = z.object({
    ...basePartyFields,
    logo: logoFile().optional().meta({ description: 'Logo image file' }),
    removeLogo: stringBoolean.default(false).meta({
        description: 'PUT only: "true" removes the current logo when no new one is sent. Defaults to false.',
    }),
});
