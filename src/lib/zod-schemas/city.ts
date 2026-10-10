import * as z from 'zod';
import { isTimeZone } from '@/lib/formatters/time';
import { AuthorityType, CityStatus, HighlightCreationPermission, CityLanguage, Realm } from '@prisma/client';
import { logoFile, stringBoolean } from './primitives';

// Prisma enum schemas
export const authorityTypeSchema = z.enum(AuthorityType);
export const cityStatusSchema = z.enum(CityStatus);
export const highlightCreationPermissionSchema = z.enum(HighlightCreationPermission);
export const cityLanguageSchema = z.enum(CityLanguage);
export const realmSchema = z.enum(Realm);

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
  status: 'pending' as CityStatus,
  authorityType: 'municipality' as AuthorityType,
  supportsNotifications: false,
  consultationsEnabled: false,
  highlightCreationPermission: 'ADMINS_ONLY' as HighlightCreationPermission,
  language: 'el' as CityLanguage,
  realm: 'greece' as Realm,
} as const;

// Helper to convert empty string to null (for optional nullable fields)
const emptyStringToNull = z.string().transform(val => val === '' ? null : val);

// The id is part of every URL of the city.
export const cityIdSchema = z.string().min(2, {
  error: "ID must be at least 2 characters.",
}).regex(/^[a-z-]+$/, {
  error: "ID must contain only lowercase letters a-z and dashes.",
});

// Base field definitions — validation and transformation only, no defaults.
// Shared between frontend (baseCityFormSchema) and backend (baseCityFormDataSchema).
export const baseCityFields = {
  name: z.string().min(2, {
    error: "City name must be at least 2 characters.",
  }),
  name_en: z.string().min(2, {
    error: "City name (English) must be at least 2 characters.",
  }),
  name_municipality: z.string().min(2, {
    error: "Municipality name must be at least 2 characters.",
  }),
  name_municipality_en: z.string().min(2, {
    error: "Municipality name (English) must be at least 2 characters.",
  }),
  timezone: z.string().min(1, {
    error: "Timezone is required.",
  }).refine(isTimeZone, {
    error: 'Not an IANA time zone name; e.g. "Europe/Athens".',
  }),
  authorityType: authorityTypeSchema,
  status: cityStatusSchema,
  supportsNotifications: z.boolean(),
  consultationsEnabled: z.boolean(),
  highlightCreationPermission: highlightCreationPermissionSchema,
  language: cityLanguageSchema,
  realm: realmSchema,
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
  supportsNotifications: stringBoolean,
  consultationsEnabled: stringBoolean,
  diavgeiaUid: emptyStringToNull.optional(),
  // Pasted boundary GeoJSON, still as text: routes parse it with
  // parseBoundaryInput (shared with the form) and write via PostGIS.
  // Absent/empty = leave the stored geometry unchanged.
  geometry: emptyStringToNull.optional(),
});

// Create schema for FormData (POST route)
export const createCityFormDataSchema = baseCityFormDataSchema.extend({
  id: cityIdSchema,
  logoImage: logoFile({ error: 'Logo image is required' }).meta({ description: 'Logo image file' }),
});

// Update schema for FormData (PUT route) — all fields optional.
// Since there are no .default() values in the base schema, .partial()
// is sufficient: absent fields are undefined = "don't change".
export const updateCityFormDataSchema = baseCityFormDataSchema.partial().extend({
  logoImage: logoFile().optional().nullable().meta({ description: 'Replacement logo image file' }),
});

// The PUT route's fields that are not city columns: the logo removal flag
// and the city message. Absent flags are false, so a request without
// hasMessage deletes the message, as the route always did.
export const updateCityRequestFormDataSchema = updateCityFormDataSchema.extend({
  removeLogoImage: stringBoolean.default(false),
  hasMessage: stringBoolean.default(false),
  messageEmoji: z.string().optional(),
  messageTitle: z.string().optional(),
  messageDescription: z.string().optional(),
  messageCallToActionText: z.string().optional(),
  messageCallToActionUrl: z.string().optional(),
  messageCallToActionExternal: stringBoolean.default(false),
  messageIsActive: stringBoolean.default(false),
});

// Frontend form schema (extends base with id and logoImage)
export const cityFormSchema = baseCityFormSchema.extend({
  id: cityIdSchema,
  logoImage: z.file().optional(),
});

// Query of GET /cities. includeUnlisted is public, so it takes every value
// stringBoolean takes.
export const citiesListQuerySchema = z.object({
  includeUnlisted: stringBoolean.default(false).meta({
    description: 'When "true", includes non-public (pending) cities the user can administer',
    example: 'false',
  }),
});
