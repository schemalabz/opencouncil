// The one write path for the lifecycle of a meeting: its schedule status, its
// kind and format, its links to other meetings, and the visibility rules that
// the links carry. The meeting API routes call it after they authorize the
// request, so it does no auth of its own (the service key reaches it too).
import "server-only";
import { CouncilMeeting, Prisma, PrismaClient } from '@prisma/client';
import prisma from "./prisma";
import {
    LifecycleRuleError,
    validateMeetingRecord,
    type LifecycleContext,
    type MeetingRecordState,
} from '../meetingLifecycleRules';
import type { CouncilMeetingWithAdminBody } from './meetings';

type Client = Prisma.TransactionClient | PrismaClient;

/** The fields of a meeting that the lifecycle write path accepts. */
export type MeetingRecordFields = Pick<CouncilMeeting,
    | 'name' | 'name_en' | 'dateTime' | 'youtubeUrl' | 'agendaUrl' | 'administrativeBodyId'
    | 'scheduleStatus' | 'scheduleStatusReason' | 'kind' | 'sessionNumber' | 'format'
    | 'closedToPublic' | 'place' | 'postponedFromId' | 'continuationOfId'>;

export type NewMeetingRecord = Partial<MeetingRecordFields>
    & Pick<CouncilMeeting, 'cityId' | 'id' | 'dateTime'>
    & Partial<Pick<CouncilMeeting, 'released' | 'muxPlaybackId'>>;

/** A walk along a postponement chain stops here. A longer chain is a data error, not a history. */
const MAX_CHAIN_LENGTH = 50;

const chainSelect = {
    id: true,
    released: true,
    scheduleStatus: true,
    administrativeBodyId: true,
    dateTime: true,
    postponedFromId: true,
} satisfies Prisma.CouncilMeetingSelect;
type ChainRow = Prisma.CouncilMeetingGetPayload<{ select: typeof chainSelect }>;

const withAdminBody = { administrativeBody: true } satisfies Prisma.CouncilMeetingInclude;

function chainTooLong(): LifecycleRuleError {
    return new LifecycleRuleError('chainTooLong', `A postponement chain is longer than ${MAX_CHAIN_LENGTH} meetings.`);
}

/** The meeting `startId` and every meeting before it, nearest first. */
async function walkBack(client: Client, cityId: string, startId: string): Promise<ChainRow[]> {
    const rows: ChainRow[] = [];
    let id: string | null = startId;
    while (id) {
        if (rows.length >= MAX_CHAIN_LENGTH) throw chainTooLong();
        const row: ChainRow | null = await client.councilMeeting.findUnique({ where: { cityId_id: { cityId, id } }, select: chainSelect });
        if (!row) break;
        rows.push(row);
        id = row.postponedFromId;
    }
    return rows;
}

/** Every meeting after `startId` in its chain, nearest first. */
async function walkForward(client: Client, cityId: string, startId: string): Promise<ChainRow[]> {
    const rows: ChainRow[] = [];
    let id = startId;
    for (;;) {
        if (rows.length >= MAX_CHAIN_LENGTH) throw chainTooLong();
        const next = await client.councilMeeting.findFirst({ where: { cityId, postponedFromId: id }, select: chainSelect });
        if (!next) return rows;
        rows.push(next);
        id = next.id;
    }
}

/** Hide `fromId` and every meeting before it: a later meeting of the chain is public. */
async function hideChainFrom(tx: Prisma.TransactionClient, cityId: string, fromId: string) {
    const earlier = await walkBack(tx, cityId, fromId);
    const shown = earlier.filter((row) => row.released).map((row) => row.id);
    if (shown.length > 0) {
        await tx.councilMeeting.updateMany({ where: { cityId, id: { in: shown } }, data: { released: false } });
    }
}

/** The new meeting stops being public, so the postponed meeting before it is shown again. */
async function showPredecessor(tx: Prisma.TransactionClient, cityId: string, predecessorId: string) {
    await tx.councilMeeting.updateMany({
        where: { cityId, id: predecessorId, scheduleStatus: 'postponed' },
        data: { released: true },
    });
}

async function loadContext(client: Client, cityId: string, next: MeetingRecordState): Promise<LifecycleContext> {
    const [body, postponedFrom, postponedTo, continuationOf, continuations] = await Promise.all([
        next.administrativeBodyId
            ? client.administrativeBody.findFirst({ where: { id: next.administrativeBodyId, cityId }, select: { type: true } })
            : null,
        next.postponedFromId
            ? client.councilMeeting.findUnique({ where: { cityId_id: { cityId, id: next.postponedFromId } }, select: chainSelect })
            : null,
        client.councilMeeting.findFirst({ where: { cityId, postponedFromId: next.id }, select: { administrativeBodyId: true } }),
        next.continuationOfId
            ? client.councilMeeting.findUnique({
                where: { cityId_id: { cityId, id: next.continuationOfId } },
                select: { administrativeBodyId: true, continuationOfId: true, dateTime: true },
            })
            : null,
        client.councilMeeting.findMany({ where: { cityId, continuationOfId: next.id }, select: { administrativeBodyId: true, dateTime: true } }),
    ]);

    const chainReachesSelf = postponedFrom
        ? (await walkBack(client, cityId, postponedFrom.id)).some((row) => row.id === next.id)
        : false;

    return {
        body,
        postponedFrom: next.postponedFromId ? (postponedFrom ?? 'missing') : null,
        postponedTo,
        chainReachesSelf,
        continuationOf: next.continuationOfId ? (continuationOf ?? 'missing') : null,
        continuations,
    };
}

async function assertValid(client: Client, cityId: string, next: MeetingRecordState) {
    const [first] = validateMeetingRecord(next, await loadContext(client, cityId, next));
    if (first) throw first;
}

function recordState(id: string, fields: Partial<MeetingRecordFields> & Pick<CouncilMeeting, 'dateTime'>): MeetingRecordState {
    return {
        id,
        administrativeBodyId: fields.administrativeBodyId ?? null,
        dateTime: fields.dateTime,
        scheduleStatus: fields.scheduleStatus ?? 'scheduled',
        scheduleStatusReason: fields.scheduleStatusReason ?? null,
        kind: fields.kind ?? null,
        sessionNumber: fields.sessionNumber ?? null,
        format: fields.format ?? 'inPerson',
        postponedFromId: fields.postponedFromId ?? null,
        continuationOfId: fields.continuationOfId ?? null,
    };
}

export async function createMeetingRecord(data: NewMeetingRecord): Promise<CouncilMeetingWithAdminBody> {
    return prisma.$transaction(async (tx) => {
        await assertValid(tx, data.cityId, recordState(data.id, data));
        const meeting = await tx.councilMeeting.create({ data, include: withAdminBody });
        if (meeting.released && meeting.postponedFromId) {
            await hideChainFrom(tx, data.cityId, meeting.postponedFromId);
        }
        return meeting;
    });
}

/**
 * Update a meeting through the lifecycle rules. A field that the patch leaves
 * out keeps its value. A change of status never changes the visibility: a
 * postponed meeting stays public until its new meeting is released.
 */
export async function updateMeetingRecord(
    cityId: string,
    id: string,
    patch: Partial<MeetingRecordFields>,
    { tx }: { tx?: Prisma.TransactionClient } = {},
): Promise<CouncilMeetingWithAdminBody> {
    const run = async (client: Prisma.TransactionClient) => {
        const current = await client.councilMeeting.findUnique({ where: { cityId_id: { cityId, id } } });
        if (!current) throw new Error(`Meeting ${cityId}/${id} not found`);

        const merged = { ...current, ...definedOnly(patch) };
        await assertValid(client, cityId, recordState(id, merged));

        const relinked = merged.postponedFromId !== current.postponedFromId;
        const meeting = await client.councilMeeting.update({
            where: { cityId_id: { cityId, id } },
            data: definedOnly(patch),
            include: withAdminBody,
        });
        // A relink applies the visibility at once when the meeting or a later
        // meeting of its chain is public, the same as a release would: the
        // meetings before it are hidden, and the old predecessor is shown.
        if (relinked) {
            const publicAtOrAfter = current.released || (await walkForward(client, cityId, id)).some((row) => row.released);
            if (publicAtOrAfter) {
                if (current.postponedFromId) await showPredecessor(client, cityId, current.postponedFromId);
                if (merged.postponedFromId) await hideChainFrom(client, cityId, merged.postponedFromId);
            }
        }
        return meeting;
    };
    return tx ? run(tx) : prisma.$transaction(run);
}

/**
 * Release or unrelease a meeting. Releasing the new meeting of a postponement
 * hides every meeting before it in the chain. Unreleasing it, when it was
 * released, shows its direct predecessor again. The call is idempotent: a
 * meeting that already has the requested visibility changes nothing.
 */
export async function setMeetingReleased(cityId: string, id: string, released: boolean): Promise<CouncilMeetingWithAdminBody> {
    return prisma.$transaction(async (tx) => {
        const current = await tx.councilMeeting.findUnique({ where: { cityId_id: { cityId, id } }, select: chainSelect });
        if (!current) throw new Error(`Meeting ${cityId}/${id} not found`);

        if (released) {
            const later = await walkForward(tx, cityId, id);
            if (later.some((row) => row.released)) {
                throw new LifecycleRuleError('laterMeetingReleased', 'A later meeting of this postponement is public. Unrelease it first.');
            }
            if (current.postponedFromId) await hideChainFrom(tx, cityId, current.postponedFromId);
        } else if (current.released && current.postponedFromId) {
            await showPredecessor(tx, cityId, current.postponedFromId);
        }

        return tx.councilMeeting.update({
            where: { cityId_id: { cityId, id } },
            data: { released },
            include: withAdminBody,
        });
    });
}

/**
 * Delete a meeting. When it was the public new meeting of a postponement, the
 * postponed meeting is shown again. A meeting that another meeting links to
 * cannot be deleted.
 */
export async function deleteMeetingRecord(cityId: string, id: string): Promise<void> {
    try {
        await prisma.$transaction(async (tx) => {
            const current = await tx.councilMeeting.findUnique({ where: { cityId_id: { cityId, id } }, select: chainSelect });
            if (!current) throw new Error(`Meeting ${cityId}/${id} not found`);
            if (current.released && current.postponedFromId) await showPredecessor(tx, cityId, current.postponedFromId);
            await tx.councilMeeting.delete({ where: { cityId_id: { cityId, id } } });
        });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
            throw new LifecycleRuleError('hasDependents', 'Another meeting links to this meeting. Remove that link first.');
        }
        throw error;
    }
}

/**
 * The date for which the meeting was first scheduled: the date of the first
 * meeting of its postponement chain. Null when the meeting is not the new
 * meeting of a postponement. The walk passes through unreleased meetings, so
 * only the date may leave the server, never their ids.
 */
export async function originalScheduledDate(client: Client, cityId: string, id: string): Promise<Date | null> {
    const chain = await walkBack(client, cityId, id);
    return chain.length > 1 ? chain[chain.length - 1].dateTime : null;
}

function definedOnly<T extends object>(patch: T): Partial<T> {
    return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<T>;
}
