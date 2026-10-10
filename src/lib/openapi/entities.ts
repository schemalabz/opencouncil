import * as z from 'zod';
import { PeopleOrdering } from '@prisma/client';
import { baseCityFields, authorityTypeSchema, cityStatusSchema } from '@/lib/zod-schemas/city';
import { administrativeBodyTypeSchema, notificationBehaviorSchema } from '@/lib/zod-schemas/administrativeBody';

// The response schemas of the records that several route files return. The
// handlers send Prisma payloads, so each schema lists the columns of its
// model; the response test parses real handler output with them.

const cityCountsSchema = z.object({
    persons: z.number().int(),
    parties: z.number().int(),
    councilMeetings: z.number().int(),
});

// Reuse baseCityFields (single source of truth for model field names and
// types), then add the DB-generated fields that aren't part of the form.
export const CitySchema = z.object({
    id: z.string(),
    ...baseCityFields,
    peopleOrdering: z.enum(PeopleOrdering),
    logoImage: z.string().nullable(),
    diavgeiaUid: z.string().nullable(),
    wikipediaId: z.string().nullable(),
    population: z.number().int().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
}).meta({ id: 'City' });

export const CityWithCountsSchema = CitySchema.extend({
    _count: cityCountsSchema,
}).meta({ id: 'CityWithCounts' });

// Matches CityMinimalWithCounts returned by getAllCitiesMinimal() — a subset of CitySchema
// without diavgeiaUid, wikipediaId, population, createdAt, updatedAt.
export const CityMinimalSchema = z.object({
    id: z.string(),
    name: z.string(),
    name_en: z.string(),
    name_municipality: z.string(),
    name_municipality_en: z.string(),
    logoImage: z.string().nullable(),
    timezone: z.string(),
    supportsNotifications: z.boolean(),
    status: cityStatusSchema,
    officialSupport: z.boolean(),
    authorityType: authorityTypeSchema,
    _count: cityCountsSchema,
}).meta({ id: 'CityMinimal' });

// GET /api/cities/{cityId} returns CityWithCounts + PostGIS geometry (getCity includes _count).
export const CityWithGeometrySchema = CityWithCountsSchema.extend({
    geometry: z.record(z.string(), z.unknown()).nullable().optional().meta({ description: 'GeoJSON geometry' }),
}).meta({ id: 'CityWithGeometry' });

// The public fields of an administrative body (publicAdministrativeBodySelect),
// as every public read that includes the relation returns them.
export const AdministrativeBodySchema = z.object({
    id: z.string(),
    name: z.string(),
    name_en: z.string(),
    type: administrativeBodyTypeSchema,
    cityId: z.string(),
    youtubeChannelUrl: z.string().nullable(),
    place: z.string().nullable().meta({ description: 'The hall where the body meets as a rule.' }),
}).meta({ id: 'AdministrativeBody' });

// The whole AdministrativeBody row with the settings of the municipality. Only
// the admin writes return it, to an editor of the city.
export const AdministrativeBodyWithSettingsSchema = AdministrativeBodySchema.extend({
    notificationBehavior: notificationBehaviorSchema,
    showUnreviewedTranscript: z.boolean(),
    contactEmails: z.array(z.string()),
    diavgeiaUnitIds: z.array(z.string()).meta({
        description: 'Diavgeia scopes polled for the decisions of the body, each `unit[:signer]`.',
    }),
    decisionConventions: z.unknown().meta({
        description: 'How the decisions of the body are numbered and signed. Null until set.',
    }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
}).meta({ id: 'AdministrativeBodyWithSettings' });

// Matches the Party Prisma model fields returned by the handlers.
export const PartySchema = z.object({
    id: z.string(),
    name: z.string(),
    name_en: z.string(),
    name_short: z.string(),
    name_short_en: z.string(),
    colorHex: z.string(),
    logo: z.string().nullable(),
    cityId: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
}).meta({ id: 'Party' });

// Matches the Person Prisma model fields returned by the handlers.
export const PersonSchema = z.object({
    id: z.string(),
    name: z.string(),
    name_en: z.string(),
    name_short: z.string(),
    name_short_en: z.string(),
    image: z.string().nullable(),
    profileUrl: z.string().nullable(),
    cityId: z.string(),
    activeFrom: z.iso.datetime().nullable(),
    activeTo: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
}).meta({ id: 'Person' });

// Matches RoleWithRelations: the Role columns and the party, body and city
// that the role is in.
export const RoleSchema = z.object({
    id: z.string(),
    personId: z.string(),
    cityId: z.string().nullable(),
    partyId: z.string().nullable(),
    administrativeBodyId: z.string().nullable(),
    isHead: z.boolean(),
    name: z.string().nullable(),
    name_en: z.string().nullable(),
    electedOrder: z.number().int().nullable(),
    startDate: z.iso.datetime().nullable(),
    endDate: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    party: PartySchema.nullable(),
    administrativeBody: AdministrativeBodySchema.nullable(),
    city: CitySchema.nullable(),
}).meta({ id: 'Role' });

// Matches PersonWithRelations — a Person plus their roles.
export const PersonWithRolesSchema = PersonSchema.extend({
    roles: z.array(RoleSchema),
}).meta({ id: 'PersonWithRoles' });

// Matches PartyWithPersons returned by getPartiesForCity() and getParty():
// each person is a PersonWithRoles (deduplicated from the party's roles).
export const PartyWithPeopleSchema = PartySchema.extend({
    people: z.array(PersonWithRolesSchema),
}).meta({ id: 'PartyWithPeople' });
