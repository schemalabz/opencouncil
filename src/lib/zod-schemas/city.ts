import { z } from 'zod';
import { AuthorityType, CityStatus, PeopleOrdering, HighlightCreationPermission } from '@prisma/client';

// Prisma enum schemas - use nativeEnum for type safety
export const authorityTypeSchema = z.nativeEnum(AuthorityType);
export const cityStatusSchema = z.nativeEnum(CityStatus);
export const peopleOrderingSchema = z.nativeEnum(PeopleOrdering);
export const highlightCreationPermissionSchema = z.nativeEnum(HighlightCreationPermission);

// Helper to convert string to boolean (for FormData)
const stringToBoolean = z.string().transform(val => val === 'true');

// Single base schema definition - used for both frontend and backend
// This defines the validation rules once, avoiding duplication
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
  officialSupport: z.boolean().default(false),
  status: cityStatusSchema.default('pending'),
  supportsNotifications: z.boolean(),
  consultationsEnabled: z.boolean(),
  peopleOrdering: peopleOrderingSchema.optional(),
  highlightCreationPermission: highlightCreationPermissionSchema.default('ADMINS_ONLY'),
};

// Base schema for frontend forms (React Hook Form) - uses booleans directly
export const baseCityFormSchema = z.object(baseCityFields);

// Base schema for FormData (backend API routes) - transforms strings to booleans
// Reuses the same field definitions but overrides boolean fields to accept strings
export const baseCityFormDataSchema = z.object({
  ...baseCityFields,
  // Override boolean fields to accept strings and transform them
  authorityType: authorityTypeSchema.default('municipality'),
  officialSupport: stringToBoolean.default('false'),
  supportsNotifications: stringToBoolean.default('false'),
  consultationsEnabled: stringToBoolean.default('false'),
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

// Update schema for FormData (PUT route) - all fields optional
export const updateCityFormDataSchema = baseCityFormDataSchema.partial().extend({
  name: z.string().min(2).optional(),
  name_en: z.string().min(2).optional(),
  name_municipality: z.string().min(2).optional(),
  name_municipality_en: z.string().min(2).optional(),
  timezone: z.string().min(1).optional(),
  logoImage: z.instanceof(File).optional().nullable(),
  peopleOrdering: peopleOrderingSchema.optional().nullable(),
  // Admin-only fields (handled separately in route)
  officialSupport: stringToBoolean.optional(),
  status: cityStatusSchema.optional(),
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

