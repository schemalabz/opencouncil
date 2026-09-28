import { z } from 'zod';

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
