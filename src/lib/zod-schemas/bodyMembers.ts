import { z } from 'zod';
import { roleDateSchema } from './role';

/**
 * The roster tools of an administrative body (#829): what the body page
 * sends to end a membership, to start a new term, and to import a pasted
 * list of members. Shared by the routes and by the roster parser, which
 * checks the model's answer with the entry schema.
 */

const text = (max: number) => z.string().trim().min(1).max(max);

/** One person as a pasted list names them. The role is their title on the body, when the list gives one. */
export const rosterEntrySchema = z.object({
    name: text(120),
    name_en: text(120),
    name_short: text(60),
    name_short_en: text(60),
    roleName: z.string().trim().max(120).nullable().optional().transform(value => value || null),
    roleName_en: z.string().trim().max(120).nullable().optional().transform(value => value || null),
    isHead: z.boolean().optional().default(false),
});

export type RosterEntry = z.output<typeof rosterEntrySchema>;

/** The model's answer to a pasted list. */
export const rosterParseResultSchema = z.object({
    entries: z.array(rosterEntrySchema),
});

export const ROSTER_TEXT_MAX_LENGTH = 40_000;

/** JSON body of POST .../members/parse */
export const rosterParseRequestSchema = z.object({
    text: z.string().trim().min(1).max(ROSTER_TEXT_MAX_LENGTH),
});

/** JSON body of POST .../members: the entries the admin confirmed. */
export const rosterImportSchema = z.object({
    entries: z.array(rosterEntrySchema).min(1).max(200),
    /** When the memberships start. Null or absent: an open start. */
    startDate: roleDateSchema,
});

/** JSON body of POST .../members/{personId}/end and POST .../members/new-term. */
export const membershipEndSchema = z.object({
    /** When the membership ends. Absent: now. */
    endDate: roleDateSchema,
});
