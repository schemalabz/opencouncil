// Not a Server Action module: a browser reaches the one read it needs through
// src/lib/actions/administrativeBodies.ts, and the API routes check their
// input with zod.
import "server-only";
import { AdministrativeBody, Prisma } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { NotFoundError } from "@/lib/api/errors";
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
import {
    administrativeBodyWithSendSettingsInclude,
    type AdministrativeBodyWithSendSettings,
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
 * conventions). Throws unless the session edits the city. A public read uses
 * {@link getPublicAdministrativeBodiesForCity}.
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
 * Every administrative body of a city with its settings and its document send
 * settings, for the body form. Throws unless the session edits the city: the
 * send settings hold the addresses of the back office.
 */
export async function getAdministrativeBodiesWithSendSettings(cityId: string): Promise<AdministrativeBodyWithSendSettings[]> {
    await withUserAuthorizedToEdit({ cityId });
    const administrativeBodies = await prisma.administrativeBody.findMany({
        where: { cityId },
        include: administrativeBodyWithSendSettingsInclude,
        orderBy: [
            { type: 'asc' },
            { name: 'asc' },
        ],
    });
    return administrativeBodies.map(withParsedConventions);
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

export async function createAdministrativeBody(
    bodyData: Omit<AdministrativeBody, 'id' | 'createdAt' | 'updatedAt' | 'decisionConventions' | 'place'> & { place?: string | null },
    documentSendSettings?: DocumentSendSettingInput[],
): Promise<AdministrativeBodyWithSettings> {
    await withUserAuthorizedToEdit({ cityId: bodyData.cityId });
    try {
        const { cityId, name, name_en, type, notificationBehavior, showUnreviewedTranscript, youtubeChannelUrl, diavgeiaUnitIds, place } = bodyData;
        const newBody = await prisma.administrativeBody.create({
            data: { cityId, name, name_en, type, notificationBehavior, showUnreviewedTranscript, youtubeChannelUrl, diavgeiaUnitIds, place },
        });
        if (documentSendSettings) {
            await replaceDocumentSendSettings(newBody.id, documentSendSettings);
        }
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
        select: { cityId: true },
    });
    if (!existingBody) throw new NotFoundError('Administrative body not found');

    await withUserAuthorizedToEdit({ cityId: existingBody.cityId });
    try {
        // Only the fields an editor may change. A caller's cityId or conventions never reach the row.
        const { name, name_en, type, notificationBehavior, showUnreviewedTranscript, youtubeChannelUrl, diavgeiaUnitIds, place } = bodyData;
        const updatedBody = await prisma.administrativeBody.update({
            where: { id },
            data: { name, name_en, type, notificationBehavior, showUnreviewedTranscript, youtubeChannelUrl, diavgeiaUnitIds, place },
        });
        if (documentSendSettings) {
            await replaceDocumentSendSettings(id, documentSendSettings);
        }
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
    const updatedBody = await prisma.administrativeBody.update({
        where: { id },
        data: { youtubeChannelUrl },
    });
    if (documentSendSettings) {
        await replaceDocumentSendSettings(id, documentSendSettings);
    }
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
