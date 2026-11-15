// Not a Server Action module: a browser reaches the one read it needs through
// src/lib/actions/administrativeBodies.ts, and the API routes check their
// input with zod.
import "server-only";
import { AdministrativeBody, Prisma, Realm } from '@prisma/client';
import prisma from "./prisma";
import { createCache } from "../cache/index";
import { cityListTags } from "./cityListing";
import { withUserAuthorizedToEdit } from "../auth";
import { ConflictError, NotFoundError } from "@/lib/api/errors";
import { parseDecisionConventions } from "@/lib/decisionConventions";
import {
    administrativeBodySettingsSelect,
    publicAdministrativeBodySelect,
    type AdministrativeBodySettings,
    type AdministrativeBodyWithSettings,
    type PublicAdministrativeBody,
} from "./types/administrativeBody";
import { replaceDocumentSendSettings } from "./documentSends";
import type { DocumentSendSettingInput } from "@/lib/zod-schemas/administrativeBody";
import { tierNeedsSuperadmin } from "@/lib/utils/bodyTier";
import {
    administrativeBodyWithSendSettingsInclude,
    bodyContactsSelect,
    type AdministrativeBodyWithSendSettings,
    type BodyContacts,
} from "./types/documentSend";

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
 * Every administrative body of a city with all its settings (Diavgeia units,
 * conventions, and the document send settings, which hold the addresses of
 * the back office), for the body form. Throws unless the session edits the
 * city. A public read uses {@link getPublicAdministrativeBodiesForCity}.
 */
export async function getAdministrativeBodiesForCity(cityId: string): Promise<AdministrativeBodyWithSendSettings[]> {
    await withUserAuthorizedToEdit({ cityId });
    try {
        const administrativeBodies = await prisma.administrativeBody.findMany({
            where: { cityId },
            include: administrativeBodyWithSendSettingsInclude,
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

/** The settings that an admin of the body may change (#828, #874). Gated on the body. */
export async function getAdministrativeBodyContacts(cityId: string, bodyId: string): Promise<BodyContacts | null> {
    await withUserAuthorizedToEdit({ cityId, administrativeBodyId: bodyId });
    return prisma.administrativeBody.findFirst({
        where: { id: bodyId, cityId },
        select: bodyContactsSelect,
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
 * The ids of the secondary bodies of a realm. The search index holds the id of
 * a body and not its tier, so search reads the tier through these ids (see
 * searchTierFilter). The paths that change the set refresh the city lists: a
 * new secondary body, a change of tier, and a city that changes realm.
 */
export async function getSecondaryBodyIdsCached(realm: Realm): Promise<string[]> {
    return createCache(
        async () => (await prisma.administrativeBody.findMany({
            where: { tier: 'secondary', city: { realm } },
            select: { id: true },
        })).map(body => body.id),
        ['administrativeBodies', 'secondary', realm],
        { revalidate: 900, tags: cityListTags(realm) },
    )();
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

export async function createAdministrativeBody(
    bodyData: Omit<AdministrativeBody, 'id' | 'createdAt' | 'updatedAt' | 'decisionConventions' | 'place'> & { place?: string | null },
    documentSendSettings?: DocumentSendSettingInput[],
): Promise<AdministrativeBodyWithSettings> {
    await withUserAuthorizedToEdit({ cityId: bodyData.cityId });
    if (tierNeedsSuperadmin(bodyData, null)) await withUserAuthorizedToEdit({});
    try {
        const { cityId, name, name_en, type, tier, notificationBehavior, showUnreviewedTranscript, youtubeChannelUrl, diavgeiaUnitIds, place } = bodyData;
        // One transaction: a body is never left without the settings its request carried
        const newBody = await prisma.$transaction(async (tx) => {
            const created = await tx.administrativeBody.create({
                data: { cityId, name, name_en, type, tier, notificationBehavior, showUnreviewedTranscript, youtubeChannelUrl, diavgeiaUnitIds, place },
            });
            if (documentSendSettings) await replaceDocumentSendSettings(tx, created.id, documentSendSettings);
            return created;
        });
        return withParsedConventions(newBody);
    } catch (error) {
        console.error('Error creating administrative body:', error);
        throw new Error('Failed to create administrative body');
    }
}

export async function editAdministrativeBody(
    id: string,
    bodyData: Partial<Omit<AdministrativeBody, 'id' | 'cityId' | 'createdAt' | 'updatedAt' | 'decisionConventions'>>,
    documentSendSettings?: DocumentSendSettingInput[],
): Promise<AdministrativeBodyWithSettings> {
    const existingBody = await prisma.administrativeBody.findUnique({
        where: { id },
        select: { cityId: true, type: true, tier: true },
    });
    if (!existingBody) throw new NotFoundError('Administrative body not found');

    await withUserAuthorizedToEdit({ cityId: existingBody.cityId });
    // A field that the write leaves out keeps its stored value.
    const next = { type: bodyData.type ?? existingBody.type, tier: bodyData.tier ?? existingBody.tier };
    if (tierNeedsSuperadmin(next, existingBody)) await withUserAuthorizedToEdit({});
    try {
        // Only the fields an editor may change. A caller's cityId or conventions never reach the row.
        const { name, name_en, type, tier, notificationBehavior, showUnreviewedTranscript, youtubeChannelUrl, diavgeiaUnitIds, place } = bodyData;
        const updatedBody = await prisma.$transaction(async (tx) => {
            const updated = await tx.administrativeBody.update({
                where: { id },
                data: { name, name_en, type, tier, notificationBehavior, showUnreviewedTranscript, youtubeChannelUrl, diavgeiaUnitIds, place },
            });
            if (documentSendSettings) await replaceDocumentSendSettings(tx, id, documentSendSettings);
            return updated;
        });
        return withParsedConventions(updatedBody);
    } catch (error) {
        console.error('Error editing administrative body:', error);
        throw new Error('Failed to edit administrative body');
    }
}

/**
 * The settings a body admin may change (#828): where the body's recordings
 * live, and which documents its back office receives (#874). The name, the
 * type, the notification behaviour and the Diavgeia scopes stay with the
 * city admin.
 */
export async function editAdministrativeBodyContacts(
    id: string,
    { youtubeChannelUrl }: Partial<Pick<AdministrativeBody, 'youtubeChannelUrl'>>,
    documentSendSettings?: DocumentSendSettingInput[],
): Promise<AdministrativeBodyWithSettings> {
    const existingBody = await prisma.administrativeBody.findUnique({
        where: { id },
        select: { cityId: true },
    });
    if (!existingBody) throw new NotFoundError('Administrative body not found');

    await withUserAuthorizedToEdit({ cityId: existingBody.cityId, administrativeBodyId: id });
    const updatedBody = await prisma.$transaction(async (tx) => {
        const updated = await tx.administrativeBody.update({
            where: { id },
            data: { youtubeChannelUrl },
        });
        if (documentSendSettings) await replaceDocumentSendSettings(tx, id, documentSendSettings);
        return updated;
    });
    return withParsedConventions(updatedBody);
}

/**
 * Deletes a body that holds no meetings and no roles. The schema sets the
 * body of its meetings to null and deletes its roles, and the visibility
 * rules read a meeting with no body and a person with no role as primary.
 * Deleting a secondary body that is not empty would therefore show its
 * meetings and its members (for example the minors of a youth council) in
 * every default list. Deleting only the roles of the members has the same
 * effect, so the message asks for the people.
 */
export async function deleteAdministrativeBody(id: string): Promise<void> {
    await withUserAuthorizedToEdit({});
    const existingBody = await prisma.administrativeBody.findUnique({
        where: { id },
        select: { id: true, _count: { select: { meetings: true, roles: true } } },
    });
    if (!existingBody) throw new NotFoundError('Administrative body not found');
    const { meetings, roles } = existingBody._count;
    if (meetings > 0 || roles > 0) {
        throw new ConflictError(
            `The body still has ${meetings} meeting(s) and ${roles} member role(s). Delete its meetings and its members (the people) first. For a member who holds another role, delete only the role on this body.`
        );
    }

    try {
        await prisma.administrativeBody.delete({
            where: { id },
        });
    } catch (error) {
        console.error('Error deleting administrative body:', error);
        throw new Error('Failed to delete administrative body');
    }
}
