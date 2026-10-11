import 'server-only';
import { Prisma } from '@prisma/client';
import prisma from './prisma';
import type { AdjacentMeetings } from './types';

/**
 * The meetings on either side of one, in time. Within the same administrative
 * body: "the previous council meeting" is what a reader steps to, not the
 * committee that met the day before. A meeting with no body steps through the
 * city's other body-less meetings, so the two directions agree. Ties on the
 * same minute break on id, so the order is total and the two directions never
 * skip or repeat a meeting.
 *
 * A server-only module, not a "use server" one: `includeUnreleased` is the
 * caller's authorization, and an exported action would take it from anyone.
 */
export async function getAdjacentMeetings(cityId: string, meetingId: string, { includeUnreleased = false } = {}): Promise<AdjacentMeetings> {
    const current = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        select: { dateTime: true, administrativeBodyId: true },
    });
    if (!current) return { previous: null, next: null };

    const scope: Prisma.CouncilMeetingWhereInput = {
        cityId,
        administrativeBodyId: current.administrativeBodyId,
        ...(includeUnreleased ? {} : { released: true }),
    };
    const select = { id: true, name: true, name_en: true } as const;
    const [previous, next] = await Promise.all([
        prisma.councilMeeting.findFirst({
            where: { ...scope, OR: [{ dateTime: { lt: current.dateTime } }, { dateTime: current.dateTime, id: { lt: meetingId } }] },
            orderBy: [{ dateTime: 'desc' }, { id: 'desc' }],
            select,
        }),
        prisma.councilMeeting.findFirst({
            where: { ...scope, OR: [{ dateTime: { gt: current.dateTime } }, { dateTime: current.dateTime, id: { gt: meetingId } }] },
            orderBy: [{ dateTime: 'asc' }, { id: 'asc' }],
            select,
        }),
    ]);
    return { previous, next };
}
