import * as z from 'zod';
import { basePartyFields } from './party';
import { basePersonFields } from './person';
import { baseAdministrativeBodyFields, youtubeChannelUrlValue } from './administrativeBody';
import { baseRoleFields, roleDatesInOrder, roleDatesInOrderIssue, rolePeriodsOverlap } from './role';
import { blankToNull, webUrl } from './primitives';

// The payload of populate_city: the parties, administrative bodies, people
// and roles of a city that has no data yet. A role names its party or its
// body by the `name` of an entry in the same payload, because none of them
// has an id yet.
//
// populate_city validates with this schema, and populateCity takes its type
// from it.

const optionalText = z.string().nullable().optional();
// The app renders these links and images, so only http(s) is accepted. An empty
// value means no link and is saved as null.
const optionalLink = blankToNull(webUrl().or(z.literal('')));

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
        logo: optionalLink.describe('Absolute http(s) URL of the party logo, or null'),
    })).describe('Political parties/coalitions in the council'),
    // A city without a body has nowhere to hold a meeting.
    administrativeBodies: z.array(z.object({
        ...baseAdministrativeBodyFields,
        // Found by research (the add-city skill).
        // The "unit" / "unit:signer" form that parseDiavgeiaUnitScope reads, narrowed to digits:
        // Diavgeia unit and signer uids are numbers, so a comma-joined paste ("1,2") or a stray
        // colon ("1:") is refused instead of saved as one entry.
        diavgeiaUnitIds: z.array(z.string().trim().regex(/^\d+(:\d+)?$/, { error: 'Expected a Diavgeia unit uid, or unit:signer' }))
            .nullable().optional()
            .describe('Greece: the Diavgeia units that publish this body\'s decisions, each "unit" or "unit:signer", or null'),
        youtubeChannelUrl: youtubeChannelUrlValue.nullable().optional()
            .describe('The YouTube channel that streams this body\'s meetings, for example https://www.youtube.com/@handle, or null'),
    }))
        .min(1, { error: 'Add at least one administrative body, e.g. the council.' })
        .describe('Administrative bodies like council, committees, communities. At least one, e.g. the council itself'),
    people: z.array(z.object({
        ...basePersonFields,
        image: optionalLink.describe("Absolute http(s) URL of the person's photo, or null"),
        profileUrl: optionalLink.describe("Absolute http(s) URL of the person's profile page, or null"),
        roles: z.array(cityPopulationRoleSchema).optional().describe('Roles assigned to this person'),
    })).describe('All people in the council'),
}).superRefine((data, ctx) => {
    // A role links to the first party or body with its name, so a second entry
    // with the same name would get no role and no warning.
    const refuseDuplicateNames = (entries: { name: string }[], key: 'parties' | 'administrativeBodies', noun: string) => {
        const firstIndex = new Map<string, number>();
        entries.forEach((entry, index) => {
            const first = firstIndex.get(entry.name);
            if (first === undefined) {
                firstIndex.set(entry.name, index);
                return;
            }
            ctx.addIssue({ code: 'custom', path: [key, index, 'name'],
                message: `The ${noun} name "${entry.name}" is also the name of ${key}[${first}]. Roles name a ${noun} by its \`name\`, so each ${noun} needs a different one.` });
        });
    };
    refuseDuplicateNames(data.parties, 'parties', 'party');
    refuseDuplicateNames(data.administrativeBodies, 'administrativeBodies', 'body');

    // The app reads every head city role as the mayor, so two of them cannot hold
    // at the same time. A mayor who follows an earlier one is valid.
    const headCityRoles = data.people.flatMap((person, personIndex) => (person.roles ?? []).flatMap((role, roleIndex) =>
        role.type === 'city' && role.isHead ? [{ person, personIndex, role, roleIndex }] : []));
    const period = (role: { startDate: Date | null; endDate: Date | null }) =>
        `${role.startDate?.toISOString() ?? 'no start date'} to ${role.endDate?.toISOString() ?? 'no end date'}`;
    headCityRoles.forEach((later, laterIndex) => {
        headCityRoles.slice(0, laterIndex).forEach(earlier => {
            if (!rolePeriodsOverlap(earlier.role, later.role)) return;
            ctx.addIssue({ code: 'custom', path: ['people', later.personIndex, 'roles', later.roleIndex, 'isHead'],
                message: `${later.person.name}: this head city role (${period(later.role)}) holds at the same time as the head city role at people[${earlier.personIndex}].roles[${earlier.roleIndex}] of ${earlier.person.name} (${period(earlier.role)}). The app reads every head city role as the mayor. End one role on or before the startDate of the other, or remove isHead from one of them.` });
        });
    });

    // populateCity links a role by the name of a party or body in the same payload,
    // and saves a role whose name matches nothing with no link. An agent writes these
    // names by hand, so a wrong one is routine and must fail loudly.
    const parties = new Set(data.parties.map(party => party.name));
    const bodies = new Set(data.administrativeBodies.map(body => body.name));
    data.people.forEach((person, personIndex) => {
        person.roles?.forEach((role, roleIndex) => {
            const path = ['people', personIndex, 'roles', roleIndex];
            if (role.type === 'party' && !(role.partyName && parties.has(role.partyName))) {
                ctx.addIssue({ code: 'custom', path: [...path, 'partyName'],
                    message: `${person.name}: party role names the unknown party "${role.partyName ?? ''}". Name a party of this payload by its exact \`name\`.` });
            }
            if (role.type === 'adminBody' && !(role.administrativeBodyName && bodies.has(role.administrativeBodyName))) {
                ctx.addIssue({ code: 'custom', path: [...path, 'administrativeBodyName'],
                    message: `${person.name}: adminBody role names the unknown body "${role.administrativeBodyName ?? ''}". Name a body of this payload by its exact \`name\`.` });
            }
        });
    });
});

export type CityPopulationInput = z.input<typeof cityPopulationSchema>;
export type CityPopulationData = z.output<typeof cityPopulationSchema>;

