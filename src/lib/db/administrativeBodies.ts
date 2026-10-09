// Not a Server Action module: a browser reaches the one read it needs through
// src/lib/actions/administrativeBodies.ts, and the API routes check their
// input with zod.
import "server-only";
import { AdministrativeBody, AdministrativeBodyType, Prisma, Realm } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { NotFoundError } from "@/lib/api/errors";
import { PUBLIC_CITY_WHERE } from "../cityStatus";
import { parseDecisionConventions } from "@/lib/decisionConventions";
import {
    administrativeBodySettingsSelect,
    publicAdministrativeBodySelect,
    type AdministrativeBodySettings,
    type AdministrativeBodyWithSettings,
    type PublicAdministrativeBody,
} from "./types/administrativeBody";

/**
 * The row with its stored conventions read through parseDecisionConventions.
 * A row imported before 2026-09-14 holds older anchor names. The editor reads
 * and writes answer the current names, which the spec documents and the
 * forms and pages read without a second parse.
 */
export function withParsedConventions<T extends { decisionConventions: Prisma.JsonValue }>(body: T): Omit<T, 'decisionConventions'> & Pick<AdministrativeBodyWithSettings, 'decisionConventions'> {
    return { ...body, decisionConventions: parseDecisionConventions(body.decisionConventions) };
}

/**
 * Every administrative body of a city with all its settings (contact emails,
 * Diavgeia units, conventions). Throws unless the session edits the city. A
 * public read uses {@link getPublicAdministrativeBodiesForCity}.
 */
export async function getAdministrativeBodiesForCity(cityId: string): Promise<AdministrativeBodyWithSettings[]> {
    await withUserAuthorizedToEdit({ cityId });
    try {
        const administrativeBodies = await prisma.administrativeBody.findMany({
            where: { cityId },
            orderBy: [
                { type: 'asc' },
                { name: 'asc' },
            ],
        });
        return administrativeBodies.map(withParsedConventions);
    } catch (error) {
        console.error('Error fetching administrative bodies:', error);
        throw new Error('Failed to fetch administrative bodies');
    }
}

/**
 * What the page of a body shows everyone: the public fields (with the hall it
 * sits in and its channel), and how many public meetings it has held.
 */
export const bodyPageSelect = {
    ...publicAdministrativeBodySelect,
    _count: { select: { meetings: { where: { released: true } } } },
} satisfies Prisma.AdministrativeBodySelect;

export type BodyPageRow = Prisma.AdministrativeBodyGetPayload<{ select: typeof bodyPageSelect }>;

/** The body for its page. Null when the body does not exist or belongs to another city. */
export async function getBodyPageRow(cityId: string, bodyId: string): Promise<BodyPageRow | null> {
    return prisma.administrativeBody.findFirst({ where: { id: bodyId, cityId }, select: bodyPageSelect });
}

/** The contact settings that an admin of the body may change (#828). Gated on the body. */
export async function getAdministrativeBodyContacts(
    cityId: string,
    bodyId: string,
): Promise<{ youtubeChannelUrl: string | null; contactEmails: string[] } | null> {
    await withUserAuthorizedToEdit({ cityId, administrativeBodyId: bodyId });
    return prisma.administrativeBody.findFirst({
        where: { id: bodyId, cityId },
        select: { youtubeChannelUrl: true, contactEmails: true },
    });
}

/**
 * Every administrative body of a city, with the fields anyone may read. The
 * public twin of {@link getAdministrativeBodiesForCity}.
 */
export async function getPublicAdministrativeBodiesForCity(cityId: string): Promise<PublicAdministrativeBody[]> {
    try {
        return await prisma.administrativeBody.findMany({
            where: { cityId },
            select: publicAdministrativeBodySelect,
            orderBy: [
                { type: 'asc' },
                { name: 'asc' },
            ],
        });
    } catch (error) {
        console.error('Error fetching administrative bodies:', error);
        throw new Error('Failed to fetch administrative bodies');
    }
}

/**
 * Administrative bodies that have at least one released (public) meeting.
 * Used by public surfaces (e.g. the embed widget configurator) so the body
 * filter only offers bodies a visitor could actually see meetings for.
 *
 * Public fields only: a browser reaches this through a Server Action that takes
 * any city id, and the meetings tab hands the result to a Client Component.
 */
export async function getAdministrativeBodiesWithPublicMeetings(cityId: string): Promise<PublicAdministrativeBody[]> {
    try {
        return await prisma.administrativeBody.findMany({
            where: {
                cityId,
                meetings: { some: { released: true } },
            },
            select: publicAdministrativeBodySelect,
            orderBy: [
                { type: 'asc' },
                { name: 'asc' },
            ],
        });
    } catch (error) {
        console.error('Error fetching administrative bodies with public meetings:', error);
        throw new Error('Failed to fetch administrative bodies');
    }
}

/**
 * The settings of the body that holds a meeting, for the meeting's admin page
 * and decisions page. Throws unless the session edits the meeting: an admin of
 * the city, or an admin of the meeting's body. Null when the meeting has no body.
 */
export async function getMeetingBodySettings(cityId: string, meetingId: string): Promise<AdministrativeBodySettings | null> {
    await withUserAuthorizedToEdit({ cityId, councilMeetingId: meetingId });
    const meeting = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        select: { administrativeBody: { select: administrativeBodySettingsSelect } },
    });
    return meeting?.administrativeBody ? withParsedConventions(meeting.administrativeBody) : null;
}

export async function createAdministrativeBody(bodyData: Omit<AdministrativeBody, 'id' | 'createdAt' | 'updatedAt' | 'decisionConventions' | 'place'> & { place?: string | null }): Promise<AdministrativeBodyWithSettings> {
    await withUserAuthorizedToEdit({ cityId: bodyData.cityId });
    try {
        const { cityId, name, name_en, type, notificationBehavior, showUnreviewedTranscript, youtubeChannelUrl, contactEmails, diavgeiaUnitIds, place } = bodyData;
        const newBody = await prisma.administrativeBody.create({
            data: { cityId, name, name_en, type, notificationBehavior, showUnreviewedTranscript, youtubeChannelUrl, contactEmails, diavgeiaUnitIds, place },
        });
        return withParsedConventions(newBody);
    } catch (error) {
        console.error('Error creating administrative body:', error);
        throw new Error('Failed to create administrative body');
    }
}

export async function editAdministrativeBody(
    id: string,
    bodyData: Partial<Omit<AdministrativeBody, 'id' | 'cityId' | 'createdAt' | 'updatedAt' | 'decisionConventions'>>
): Promise<AdministrativeBodyWithSettings> {
    const existingBody = await prisma.administrativeBody.findUnique({
        where: { id },
        select: { cityId: true },
    });
    if (!existingBody) throw new NotFoundError('Administrative body not found');

    await withUserAuthorizedToEdit({ cityId: existingBody.cityId });
    try {
        // Only the fields an editor may change. A caller's cityId or conventions never reach the row.
        const { name, name_en, type, notificationBehavior, showUnreviewedTranscript, youtubeChannelUrl, contactEmails, diavgeiaUnitIds, place } = bodyData;
        const updatedBody = await prisma.administrativeBody.update({
            where: { id },
            data: { name, name_en, type, notificationBehavior, showUnreviewedTranscript, youtubeChannelUrl, contactEmails, diavgeiaUnitIds, place },
        });
        return withParsedConventions(updatedBody);
    } catch (error) {
        console.error('Error editing administrative body:', error);
        throw new Error('Failed to edit administrative body');
    }
}

/**
 * The two settings a body admin may change (#828): where the body's
 * recordings live and who receives its transcripts. The name, the type, the
 * notification behaviour and the Diavgeia scopes stay with the city admin.
 */
export async function editAdministrativeBodyContacts(
    id: string,
    { youtubeChannelUrl, contactEmails }: Partial<Pick<AdministrativeBody, 'youtubeChannelUrl' | 'contactEmails'>>
): Promise<AdministrativeBodyWithSettings> {
    const existingBody = await prisma.administrativeBody.findUnique({
        where: { id },
        select: { cityId: true },
    });
    if (!existingBody) throw new NotFoundError('Administrative body not found');

    await withUserAuthorizedToEdit({ cityId: existingBody.cityId, administrativeBodyId: id });
    const updatedBody = await prisma.administrativeBody.update({
        where: { id },
        data: { youtubeChannelUrl, contactEmails },
    });
    return withParsedConventions(updatedBody);
}

export async function deleteAdministrativeBody(id: string): Promise<void> {
    await withUserAuthorizedToEdit({});
    const existingBody = await prisma.administrativeBody.findUnique({
        where: { id },
        select: { id: true },
    });
    if (!existingBody) throw new NotFoundError('Administrative body not found');

    try {
        await prisma.administrativeBody.delete({
            where: { id },
        });
    } catch (error) {
        console.error('Error deleting administrative body:', error);
        throw new Error('Failed to delete administrative body');
    }
}

/**
 * A body on the directory of its type (#829): its public fields, its city,
 * and what a card draws: the active members, the released meetings, the
 * last of them. `now` is the instant a membership counts as active at.
 */
function bodyDirectorySelect(now: Date) {
    return {
        ...publicAdministrativeBodySelect,
        city: {
            select: { id: true, name: true, name_en: true, name_municipality: true, name_municipality_en: true, logoImage: true, timezone: true },
        },
        _count: {
            select: {
                meetings: { where: { released: true } },
                roles: {
                    where: {
                        AND: [
                            { OR: [{ startDate: null }, { startDate: { lte: now } }] },
                            { OR: [{ endDate: null }, { endDate: { gt: now } }] },
                        ],
                    },
                },
            },
        },
        // The last meeting held: a published next meeting is not it.
        meetings: { where: { released: true, dateTime: { lte: now } }, orderBy: { dateTime: 'desc' }, take: 1, select: { id: true, dateTime: true } },
    } satisfies Prisma.AdministrativeBodySelect;
}

export type BodyDirectoryRow = Prisma.AdministrativeBodyGetPayload<{ select: ReturnType<typeof bodyDirectorySelect> }>;

/** The public cities of a realm: by status, or through a secondary body (#829), as PUBLIC_CITY_WHERE reads it. */
const publicCityOfRealmWhere = (realm: Realm): Prisma.CityWhereInput => ({ realm, ...PUBLIC_CITY_WHERE });

/**
 * The bodies of one type across a realm that have released a meeting, in
 * public cities, by city and then by name: the directory of the type (#829).
 */
export async function getBodyDirectory(realm: Realm, type: AdministrativeBodyType): Promise<BodyDirectoryRow[]> {
    return prisma.administrativeBody.findMany({
        where: {
            type,
            meetings: { some: { released: true } },
            city: publicCityOfRealmWhere(realm),
        },
        select: bodyDirectorySelect(new Date()),
        orderBy: [{ city: { name: 'asc' } }, { name: 'asc' }],
    });
}

/** How many bodies the directory of a type lists in a realm: the sitemap advertises a directory that has one. */
export async function countBodyDirectory(realm: Realm, type: AdministrativeBodyType): Promise<number> {
    return prisma.administrativeBody.count({
        where: { type, meetings: { some: { released: true } }, city: publicCityOfRealmWhere(realm) },
    });
}
