import * as z from 'zod';
import { basePartyFields } from './party';
import { basePersonFields } from './person';
import { baseAdministrativeBodyFields } from './administrativeBody';
import { baseRoleFields, roleDatesInOrder, roleDatesInOrderIssue } from './role';

// The payload of the City Creator: the parties, administrative bodies, people
// and roles of a city that has no data yet. A role names its party or its
// body by the `name` of an entry in the same payload, because none of them
// has an id yet.
//
// The populate route validates with this schema, the AI City Creator gives the
// model its JSON Schema and checks the answer with it, and the editor derives
// its types from it.

const optionalText = z.string().nullable().optional();

const cityPopulationRoleSchema = z.object({
    type: z.enum(['party', 'city', 'adminBody'])
        .describe('Type of role: party membership, city-wide position, or administrative body role'),
    ...baseRoleFields,
    name: baseRoleFields.name.describe('Role name in local language (empty/null for simple membership)'),
    name_en: baseRoleFields.name_en.describe('Role name in English (empty/null for simple membership)'),
    isHead: baseRoleFields.isHead.describe('Whether this person is head of the party/body'),
    startDate: baseRoleFields.startDate.describe('ISO 8601 date or date-time the role started, null if unknown'),
    endDate: baseRoleFields.endDate.describe('ISO 8601 date or date-time the role ended, null if the role is current'),
    electedOrder: baseRoleFields.electedOrder.describe('Rank of the person in the election result of the body, null if unknown'),
    partyName: optionalText.describe('Party name for party-type roles'),
    administrativeBodyName: optionalText.describe('Administrative body name for adminBody-type roles'),
}).refine(roleDatesInOrder, roleDatesInOrderIssue);

export const cityPopulationSchema = z.object({
    cityId: z.string().describe('Reference to existing city ID in the database'),
    parties: z.array(z.object({
        ...basePartyFields,
        logo: optionalText.describe('URL to party logo'),
    })).describe('Political parties/coalitions in the council'),
    // A city without a body has nowhere to hold a meeting.
    administrativeBodies: z.array(z.object(baseAdministrativeBodyFields))
        .min(1, { error: 'Add at least one administrative body, e.g. the council.' })
        .describe('Administrative bodies like council, committees, communities. At least one, e.g. the council itself'),
    people: z.array(z.object({
        ...basePersonFields,
        image: optionalText.describe("URL to person's photo"),
        activeFrom: optionalText.describe('ISO 8601 date-time'),
        activeTo: optionalText.describe('ISO 8601 date-time'),
        profileUrl: optionalText,
        partyName: optionalText.describe('Reference to party name (null for independents)'),
        roles: z.array(cityPopulationRoleSchema).optional().describe('Roles assigned to this person'),
    })).describe('All people in the council'),
});

export type CityPopulationInput = z.input<typeof cityPopulationSchema>;
export type CityPopulationData = z.output<typeof cityPopulationSchema>;
