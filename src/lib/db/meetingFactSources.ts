// Server-only: the sheet's file key and the readings are not public, and the
// writes are driven by the task callback and the admin routes, which gate on
// their own. Not "use server": nothing here may be a Server Action.
import "server-only";
import prisma from './prisma';
import { DataSource, MeetingFactSourceStatus, Prisma } from '@prisma/client';
import type { MeetingAgendaItem, MeetingFactsReading } from '@/lib/apiTypes';
import { isMeetingFactsReading } from '@/lib/derivation/sources';
import { discussionOrderKeys, orderedMinutesSubjects } from '@/lib/minutes/builders';

const factSourceSelect = {
    id: true, source: true, status: true, fileName: true, mediaType: true, reading: true, readerVersion: true,
    taskId: true, uploadedById: true, confirmedById: true, confirmedAt: true, createdAt: true, updatedAt: true,
} satisfies Prisma.MeetingFactSourceSelect;

export type MeetingFactSourceRow = Prisma.MeetingFactSourceGetPayload<{ select: typeof factSourceSelect }>;

/** The meeting's sources other than the pages, as the decisions page shows them. The file key stays out. */
export async function getMeetingFactSources(cityId: string, meetingId: string): Promise<MeetingFactSourceRow[]> {
    return prisma.meetingFactSource.findMany({ where: { cityId, councilMeetingId: meetingId }, select: factSourceSelect, orderBy: { source: 'asc' } });
}

/** One source's row with its file key, for the routes that serve or replace the file. */
export async function getMeetingFactSourceWithFile(cityId: string, meetingId: string, source: DataSource) {
    return prisma.meetingFactSource.findUnique({
        where: { cityId_councilMeetingId_source: { cityId, councilMeetingId: meetingId, source } },
        select: { ...factSourceSelect, fileKey: true },
    });
}

/**
 * A new sheet replaces the earlier one entirely: the file and the reading.
 * Sheets are corrected after the fact, and nothing from the earlier upload may
 * remain (issue #807).
 */
export async function replaceSheetFile(
    cityId: string, meetingId: string,
    file: { key: string; name: string; mediaType: string },
    uploadedById: string | null,
): Promise<MeetingFactSourceRow> {
    const where = { cityId_councilMeetingId_source: { cityId, councilMeetingId: meetingId, source: DataSource.sheet } };
    const data = {
        fileKey: file.key, fileName: file.name, mediaType: file.mediaType, uploadedById,
        status: MeetingFactSourceStatus.uploaded, reading: Prisma.DbNull, readerVersion: null, taskId: null, confirmedById: null, confirmedAt: null,
    };
    return prisma.meetingFactSource.upsert({
        where,
        create: { cityId, councilMeetingId: meetingId, source: DataSource.sheet, ...data },
        update: data,
        select: factSourceSelect,
    });
}

/**
 * Store what a reader returned; it counts at once. The transcript's row is created on the first
 * result; a sheet's row exists from the upload, and a result for a sheet that
 * was replaced meanwhile (the row holds another file) is dropped, or it would
 * attach an old file's reading to the new file. The reading is tied to the file
 * and not to the task: the row learns its task id after the task is posted, and
 * a cached read can call back before that. A result of a task older than the
 * one the row holds is dropped too: two reads of one file can overlap, and the
 * later read is the one a person asked for last.
 */
export async function storeFactSourceReading(
    cityId: string, meetingId: string, source: DataSource,
    reading: MeetingFactsReading, meta: { taskId: string; readerVersion: string | null; fileKey?: string },
): Promise<'stored' | 'superseded'> {
    const where = { cityId_councilMeetingId_source: { cityId, councilMeetingId: meetingId, source } };
    const readingJson = reading as unknown as Prisma.InputJsonValue;
    if (source === DataSource.sheet && !meta.fileKey) throw new Error('A sheet reading names the file it read');
    // The check and the write hold the row's lock, so two results that land
    // together are ordered: the second waits and then sees the first's task.
    return prisma.$transaction(async tx => {
        const [current] = await tx.$queryRaw<Array<{ taskId: string | null }>>`
            SELECT "taskId" FROM "MeetingFactSource"
            WHERE "cityId" = ${cityId} AND "councilMeetingId" = ${meetingId} AND "source" = ${source}::"DataSource"
            FOR UPDATE`;
        if (await isOlderTask(tx, meta.taskId, current?.taskId ?? null)) return 'superseded' as const;
        if (source === DataSource.sheet) {
            const updated = await tx.meetingFactSource.updateMany({
                where: { cityId, councilMeetingId: meetingId, source, fileKey: meta.fileKey },
                data: { reading: readingJson, readerVersion: meta.readerVersion, taskId: meta.taskId, status: MeetingFactSourceStatus.read },
            });
            return updated.count === 1 ? 'stored' as const : 'superseded' as const;
        }
        await tx.meetingFactSource.upsert({
            where,
            create: { cityId, councilMeetingId: meetingId, source, reading: readingJson, readerVersion: meta.readerVersion, taskId: meta.taskId, status: MeetingFactSourceStatus.read },
            update: { reading: readingJson, readerVersion: meta.readerVersion, taskId: meta.taskId, status: MeetingFactSourceStatus.read, confirmedById: null, confirmedAt: null },
        });
        return 'stored' as const;
    });
}

const READ_TASK_TYPES: Record<'sheet' | 'transcript', string> = { sheet: 'readAttendanceSheet', transcript: 'readTranscriptFacts' };

/** The state of a source's latest read, as the card reports it: a failed read is otherwise invisible until the poll gives up. */
export interface FactSourceReadState {
    taskId: string;
    status: string;
    /** When the read was asked for, as ISO; a reading stored after it is newer than this read. */
    createdAt: string;
    /** The task's own sentence for a failure, shortened; null while it runs or when it succeeded. */
    error: string | null;
}

/** The latest read task of each source other than the pages, for the sources route. */
export async function getLatestReadTasks(cityId: string, meetingId: string): Promise<Record<'sheet' | 'transcript', FactSourceReadState | null>> {
    const latest = await prisma.taskStatus.findMany({
        where: { cityId, councilMeetingId: meetingId, type: { in: Object.values(READ_TASK_TYPES) } },
        select: { id: true, type: true, status: true, responseBody: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        distinct: ['type'],
    });
    const of = (source: 'sheet' | 'transcript'): FactSourceReadState | null => {
        const task = latest.find(t => t.type === READ_TASK_TYPES[source]);
        if (!task) return null;
        return { taskId: task.id, status: task.status, createdAt: task.createdAt.toISOString(), error: task.status === 'failed' ? (task.responseBody ?? 'The read failed').slice(0, 300) : null };
    };
    return { sheet: of('sheet'), transcript: of('transcript') };
}

/** Whether `taskId` was posted before the task a row holds, so its result reports a read that a later one replaced. */
async function isOlderTask(db: Prisma.TransactionClient, taskId: string, rowTaskId: string | null): Promise<boolean> {
    if (!rowTaskId || rowTaskId === taskId) return false;
    const [held, incoming] = await Promise.all([
        db.taskStatus.findUnique({ where: { id: rowTaskId }, select: { createdAt: true } }),
        db.taskStatus.findUnique({ where: { id: taskId }, select: { createdAt: true } }),
    ]);
    return !!held && !!incoming && held.createdAt > incoming.createdAt;
}

/** The task a sheet's row waits on, so the page can tell a pending read from a finished one. */
export async function setSheetTask(cityId: string, meetingId: string, taskId: string): Promise<void> {
    await prisma.meetingFactSource.update({
        where: { cityId_councilMeetingId_source: { cityId, councilMeetingId: meetingId, source: DataSource.sheet } },
        data: { taskId },
    });
}

/** Remove a source's row; the caller deletes the file and re-derives. Returns the file key, if any. */
export async function deleteFactSource(cityId: string, meetingId: string, source: DataSource): Promise<string | null> {
    const where = { cityId_councilMeetingId_source: { cityId, councilMeetingId: meetingId, source } };
    const row = await prisma.meetingFactSource.findUnique({ where, select: { fileKey: true } });
    if (!row) return null;
    await prisma.meetingFactSource.delete({ where });
    return row.fileKey;
}

/**
 * The meeting's items as a reader anchors statements to them: the agenda items
 * by their number, the out-of-agenda items by their position among themselves.
 * The walk is the derivation's (`orderedMinutesSubjects`, withdrawn dropped), so
 * an ordinal the reader returns names the subject the derivation resolves it
 * to. A withdrawn agenda item stays by its number: a sheet is pre-printed with it.
 */
export async function getMeetingAgendaItems(cityId: string, meetingId: string): Promise<MeetingAgendaItem[]> {
    const subjects = await prisma.subject.findMany({
        where: { cityId, councilMeetingId: meetingId },
        select: { id: true, name: true, agendaItemTitle: true, agendaItemIndex: true, nonAgendaReason: true, withdrawn: true, discussedIn: { select: { id: true } } },
    });
    const linkedUtterances = subjects.length > 0
        ? await prisma.utterance.findMany({
            where: { discussionSubjectId: { in: subjects.map(s => s.id) } },
            select: { discussionSubjectId: true, discussionStatus: true, startTimestamp: true, endTimestamp: true },
        })
        : [];
    const ordered = orderedMinutesSubjects(subjects, discussionOrderKeys(linkedUtterances));
    let ordinal = 0;
    return ordered.filter(s => !s.withdrawn || s.nonAgendaReason !== 'outOfAgenda').map(s => ({
        name: s.agendaItemTitle || s.name,
        agendaItemIndex: s.nonAgendaReason === 'outOfAgenda' ? null : s.agendaItemIndex,
        outOfAgendaOrdinal: s.nonAgendaReason === 'outOfAgenda' ? ++ordinal : null,
    }));
}
