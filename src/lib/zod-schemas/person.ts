import * as z from 'zod';
import { baseRoleFields, roleDatesInOrder, roleDatesInOrderIssue } from './role';
import { imageFile, stringBoolean, webUrl } from './primitives';

// Field rules of a person — validation only, no defaults. Shared by the person
// form, the person routes, and the city import (zod-schemas/cityPopulation.ts).
export const basePersonFields = {
    name: z.string().min(2, {
        error: "Person name must be at least 2 characters.",
    }),
    name_en: z.string().min(2, {
        error: "Person name (English) must be at least 2 characters.",
    }),
    name_short: z.string().min(2, {
        error: "Short name must be at least 2 characters.",
    }),
    name_short_en: z.string().min(2, {
        error: "Short name (English) must be at least 2 characters.",
    }),
};

// Frontend form schema (React Hook Form)
export const personFormSchema = z.object({
    ...basePersonFields,
    image: z.file().optional(),
    profileUrl: webUrl().optional().or(z.literal('')),
});

export type PersonFormValues = z.infer<typeof personFormSchema>;
export type PersonFormInput = z.input<typeof personFormSchema>;

// A role as the person form sends it: it names its city, party or body by
// id. validateRoles() checks that the ids belong to the city.
export const personRoleSchema = z.object({
    cityId: z.string().nullable().optional(),
    partyId: z.string().nullable().optional(),
    administrativeBodyId: z.string().nullable().optional(),
    ...baseRoleFields,
}).refine(roleDatesInOrder, roleDatesInOrderIssue);

export type PersonRoleData = z.output<typeof personRoleSchema>;

const rolesJson = z.string().transform((value, ctx) => {
    try {
        return JSON.parse(value) as unknown;
    } catch {
        ctx.addIssue({ code: 'custom', message: 'roles must be a JSON array' });
        return z.NEVER;
    }
}).pipe(z.array(personRoleSchema)).meta({
    description: 'JSON array of role objects, each with cityId, partyId or administrativeBodyId, '
        + 'name, name_en, isHead, startDate, endDate and electedOrder. Replaces all roles of the person.',
});

// FormData body of POST /people and PUT /people/{personId}. The roles replace
// all roles of the person, so the field is required.
export const personFormDataSchema = z.object({
    ...basePersonFields,
    profileUrl: webUrl().optional().or(z.literal('')),
    image: imageFile().optional().meta({ description: 'Profile image file' }),
    removeImage: stringBoolean.default(false).meta({
        description: 'PUT only: "true" removes the current image when no new one is sent. Defaults to false.',
    }),
    roles: rolesJson,
});

export type PersonFormData = z.infer<typeof personFormDataSchema>;
