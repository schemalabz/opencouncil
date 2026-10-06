import { z } from 'zod';
import { baseRoleFields, roleDatesInOrder, roleDatesInOrderIssue } from './role';

// Field rules of a person — validation only, no defaults. Shared by the person
// form, the person routes, and the city import (zod-schemas/cityPopulation.ts).
export const basePersonFields = {
    name: z.string().min(2, {
        message: "Person name must be at least 2 characters.",
    }),
    name_en: z.string().min(2, {
        message: "Person name (English) must be at least 2 characters.",
    }),
    name_short: z.string().min(2, {
        message: "Short name must be at least 2 characters.",
    }),
    name_short_en: z.string().min(2, {
        message: "Short name (English) must be at least 2 characters.",
    }),
};

// Frontend form schema (React Hook Form)
export const personFormSchema = z.object({
    ...basePersonFields,
    image: z.instanceof(File).optional(),
    profileUrl: z.string().url().optional().or(z.literal('')),
});

export type PersonFormValues = z.infer<typeof personFormSchema>;

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
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'roles must be a JSON array' });
        return z.NEVER;
    }
}).pipe(z.array(personRoleSchema));

// FormData body of POST /people. The roles replace all roles of the person,
// so the field is required.
export const personFormDataSchema = z.object({
    ...basePersonFields,
    profileUrl: z.string().url().optional().or(z.literal('')),
    image: z.instanceof(File).optional(),
    // PUT only: remove the current image when no new one is sent
    removeImage: z.string().optional().transform(val => val === 'true'),
    roles: rolesJson,
});

// FormData body of PUT /people/{personId}. A form that may not change the
// roles (a person who claimed their own page) leaves the field out, and the
// roles stay as they are.
export const personUpdateFormDataSchema = personFormDataSchema.extend({
    roles: rolesJson.optional(),
});

export type PersonUpdateFormData = z.output<typeof personUpdateFormDataSchema>;

export type PersonFormData = z.infer<typeof personFormDataSchema>;
