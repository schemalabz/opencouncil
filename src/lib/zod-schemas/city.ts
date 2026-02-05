import { z } from 'zod';
import { AuthorityType, CityStatus, PeopleOrdering, HighlightCreationPermission } from '@prisma/client';

// Prisma enum schemas - use nativeEnum for type safety
export const authorityTypeSchema = z.nativeEnum(AuthorityType);
export const cityStatusSchema = z.nativeEnum(CityStatus);
export const peopleOrderingSchema = z.nativeEnum(PeopleOrdering);
export const highlightCreationPermissionSchema = z.nativeEnum(HighlightCreationPermission);

// Default values — single source of truth for the entire app.
// These mirror the Prisma schema defaults and are used by:
//   - Frontend forms (React Hook Form defaultValues in CityForm.tsx)
//   - Create route (merged into parsed data before DB insert)
//   - Seed script (prisma/seed.ts)
//
// IMPORTANT: Do NOT bake these into Zod schemas via .default().
// Schemas define validation & transformation only. Defaults are applied
// at the call site (route handler, form component, seed) by spreading
// CITY_DEFAULTS. This keeps the update schema clean — absent fields
// stay undefined, meaning "don't change", rather than silently
// reverting to a default value.
export const CITY_DEFAULTS = {
  officialSupport: false,
  status: 'pending' as CityStatus,
  authorityType: 'municipality' as AuthorityType,
  supportsNotifications: false,
  consultationsEnabled: false,
  peopleOrdering: 'default' as PeopleOrdering,
  highlightCreationPermission: 'ADMINS_ONLY' as HighlightCreationPermission,
} as const;

// Helper to convert string to boolean (for FormData)
const stringToBoolean = z.string().transform(val => val === 'true');

// Helper to convert empty string to null (for optional nullable fields)
const emptyStringToNull = z.string().transform(val => val === '' ? null : val);

// Base field definitions — validation and transformation only, no defaults.
// Shared between frontend (baseCityFormSchema) and backend (baseCityFormDataSchema).
const baseCityFields = {
  name: z.string().min(2, {
    message: "City name must be at least 2 characters.",
  }),
  name_en: z.string().min(2, {
    message: "City name (English) must be at least 2 characters.",
  }),
  name_municipality: z.string().min(2, {
    message: "Municipality name must be at least 2 characters.",
  }),
  name_municipality_en: z.string().min(2, {
    message: "Municipality name (English) must be at least 2 characters.",
  }),
  timezone: z.string().min(1, {
    message: "Timezone is required.",
  }),
  authorityType: authorityTypeSchema,
  officialSupport: z.boolean(),
  status: cityStatusSchema,
  supportsNotifications: z.boolean(),
  consultationsEnabled: z.boolean(),
  peopleOrdering: peopleOrderingSchema,
  highlightCreationPermission: highlightCreationPermissionSchema,
};

// Base schema for frontend forms (React Hook Form) — uses booleans directly
export const baseCityFormSchema = z.object({
  ...baseCityFields,
  diavgeiaUid: z.string().optional(),
});

// Base schema for FormData (backend API routes) — transforms strings to booleans
export const baseCityFormDataSchema = z.object({
  ...baseCityFields,
  authorityType: authorityTypeSchema,
  officialSupport: stringToBoolean,
  supportsNotifications: stringToBoolean,
  consultationsEnabled: stringToBoolean,
  diavgeiaUid: emptyStringToNull.optional(),
});

// Create schema for FormData (POST route)
export const createCityFormDataSchema = baseCityFormDataSchema.extend({
  id: z.string().min(2, {
    message: "ID must be at least 2 characters.",
  }).regex(/^[a-z-]+$/, {
    message: "ID must contain only lowercase letters a-z and dashes.",
  }),
  logoImage: z.instanceof(File, { message: 'Logo image is required' }),
});

// Update schema for FormData (PUT route) — all fields optional.
// Since there are no .default() values in the base schema, .partial()
// is sufficient: absent fields are undefined = "don't change".
export const updateCityFormDataSchema = baseCityFormDataSchema.partial().extend({
  logoImage: z.instanceof(File).optional().nullable(),
});

// Frontend form schema (extends base with id and logoImage)
export const cityFormSchema = baseCityFormSchema.extend({
  id: z.string().min(2, {
    message: "ID must be at least 2 characters.",
  }).regex(/^[a-z-]+$/, {
    message: "ID must contain only lowercase letters a-z and dashes.",
  }),
  logoImage: z.instanceof(File).optional(),
});

// Type exports
export type CityFormData = z.infer<typeof cityFormSchema>;
export type CreateCityFormData = z.infer<typeof createCityFormDataSchema>;
export type UpdateCityFormData = z.infer<typeof updateCityFormDataSchema>;
