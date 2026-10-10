// Not a Server Action module: a browser reaches the one read it needs through
// src/lib/actions/administrativeBodies.ts, and the API routes check their
// input with zod.
import "server-only";
import { AdministrativeBody } from '@prisma/client';
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { publicAdministrativeBodySelect, type PublicAdministrativeBody } from "./types/administrativeBody";

export async function getAdministrativeBodiesForCity(cityId: string): Promise<AdministrativeBody[]> {
    try {
        const administrativeBodies = await prisma.administrativeBody.findMany({
            where: { cityId },
            orderBy: [
                { type: 'asc' },
                { name: 'asc' },
            ],
        });
        return administrativeBodies;
    } catch (error) {
        console.error('Error fetching administrative bodies:', error);
        throw new Error('Failed to fetch administrative bodies');
    }
}

/**
 * Whether a body belongs to a city. Ungated: the meeting writes call it to
 * keep a meeting and its body in one city, whoever the caller is.
 */
export async function isBodyOfCity(bodyId: string, cityId: string): Promise<boolean> {
    const body = await prisma.administrativeBody.findUnique({ where: { id: bodyId }, select: { cityId: true } });
    return body?.cityId === cityId;
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

export async function createAdministrativeBody(bodyData: Omit<AdministrativeBody, 'id' | 'createdAt' | 'updatedAt' | 'decisionConventions' | 'place'> & { place?: string | null }): Promise<AdministrativeBody> {
    await withUserAuthorizedToEdit({ cityId: bodyData.cityId });
    try {
        const { cityId, name, name_en, type, notificationBehavior, showUnreviewedTranscript, youtubeChannelUrl, contactEmails, diavgeiaUnitIds, place } = bodyData;
        const newBody = await prisma.administrativeBody.create({
            data: { cityId, name, name_en, type, notificationBehavior, showUnreviewedTranscript, youtubeChannelUrl, contactEmails, diavgeiaUnitIds, place },
        });
        return newBody;
    } catch (error) {
        console.error('Error creating administrative body:', error);
        throw new Error('Failed to create administrative body');
    }
}

export async function editAdministrativeBody(
    id: string,
    bodyData: Partial<Omit<AdministrativeBody, 'id' | 'cityId' | 'createdAt' | 'updatedAt' | 'decisionConventions'>>
): Promise<AdministrativeBody> {
    const existingBody = await prisma.administrativeBody.findUnique({
        where: { id },
        select: { cityId: true },
    });
    if (!existingBody) throw new Error('Administrative body not found');

    await withUserAuthorizedToEdit({ cityId: existingBody.cityId });
    try {
        // Only the fields an editor may change. A caller's cityId or conventions never reach the row.
        const { name, name_en, type, notificationBehavior, showUnreviewedTranscript, youtubeChannelUrl, contactEmails, diavgeiaUnitIds, place } = bodyData;
        const updatedBody = await prisma.administrativeBody.update({
            where: { id },
            data: { name, name_en, type, notificationBehavior, showUnreviewedTranscript, youtubeChannelUrl, contactEmails, diavgeiaUnitIds, place },
        });
        return updatedBody;
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
): Promise<AdministrativeBody> {
    const existingBody = await prisma.administrativeBody.findUnique({
        where: { id },
        select: { cityId: true },
    });
    if (!existingBody) throw new Error('Administrative body not found');

    await withUserAuthorizedToEdit({ cityId: existingBody.cityId, administrativeBodyId: id });
    return prisma.administrativeBody.update({
        where: { id },
        data: { youtubeChannelUrl, contactEmails },
    });
}

export async function deleteAdministrativeBody(id: string): Promise<void> {
    const existingBody = await prisma.administrativeBody.findUnique({
        where: { id },
        select: { cityId: true },
    });
    if (!existingBody) throw new Error('Administrative body not found');

    await withUserAuthorizedToEdit({ cityId: existingBody.cityId });
    try {
        await prisma.administrativeBody.delete({
            where: { id },
        });
    } catch (error) {
        console.error('Error deleting administrative body:', error);
        throw new Error('Failed to delete administrative body');
    }
}

export async function updateNotificationBehavior(
    id: string,
    notificationBehavior: 'NOTIFICATIONS_DISABLED' | 'NOTIFICATIONS_AUTO' | 'NOTIFICATIONS_APPROVAL'
): Promise<AdministrativeBody & { city: { id: string; name: string; name_en: string } }> {
    const existingBody = await prisma.administrativeBody.findUnique({
        where: { id },
        select: { cityId: true },
    });
    if (!existingBody) throw new Error('Administrative body not found');

    await withUserAuthorizedToEdit({ cityId: existingBody.cityId });
    try {
        const updatedBody = await prisma.administrativeBody.update({
            where: { id },
            data: { notificationBehavior },
            include: {
                city: {
                    select: {
                        id: true,
                        name: true,
                        name_en: true
                    }
                }
            }
        });
        return updatedBody;
    } catch (error) {
        console.error('Error updating notification behavior:', error);
        throw new Error('Failed to update notification behavior');
    }
} 