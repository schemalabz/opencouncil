/**
 * The two readers of what a meeting states about itself (issue #807): the
 * back office's attendance sheet, and the transcript on its own. The requests
 * and the result handlers. Not "use server": the handlers run on the task
 * server's callback and check no session; the browser reaches the requests
 * through src/lib/actions/meetingFacts.ts and the sheet route.
 */
import "server-only";
import { DataSource } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import type { MeetingFactsReading, ReadAttendanceSheetRequest, ReadAttendanceSheetResult, ReadTranscriptFactsRequest, ReadTranscriptFactsResult } from '@/lib/apiTypes';
import { getCouncilMeetingDirect } from '@/lib/db/meetings';
import { getPeopleForCity, getPeopleForMeeting } from '@/lib/db/people';
import { getCity } from '@/lib/db/cities';
import { getFixTranscriptRequestBody } from '@/lib/db/utils';
import { getMeetingAgendaItems, getMeetingFactSourceWithFile, setSheetTask, storeFactSourceReading } from '@/lib/db/meetingFactSources';
import { rederiveMeetingQuietly } from '@/lib/derivation/rederive';
import { isMeetingFactsReading } from '@/lib/derivation/sources';
import { presignedGetUrl } from '@/lib/s3';
import { env } from '@/env.mjs';
import { isMayorRole, isRoleActiveAt } from '@/lib/utils/roles';
import { buildSpeakerRoster } from './speakerRoster';
import { startTask } from './tasks';

/** How long the task server has to fetch the sheet: a queue wait plus the read. */
const SHEET_URL_TTL_SECONDS = 60 * 60;

const SHEET_MEDIA_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type SheetMediaType = typeof SHEET_MEDIA_TYPES[number];

export function isSheetMediaType(v: string | null | undefined): v is SheetMediaType {
    return (SHEET_MEDIA_TYPES as readonly string[]).includes(v ?? '');
}

/**
 * Start the reader on the meeting's uploaded sheet. The task server gets a
 * signed URL that reads the private object for an hour; the row remembers the
 * task so the page can tell a pending read from a finished one.
 */
export async function requestReadAttendanceSheetInternal(cityId: string, meetingId: string, options: { forceRead?: boolean } = {}) {
    const [row, meeting, city, people, agendaItems] = await Promise.all([
        getMeetingFactSourceWithFile(cityId, meetingId, DataSource.sheet),
        getCouncilMeetingDirect(cityId, meetingId),
        getCity(cityId),
        getPeopleForCity(cityId),
        getMeetingAgendaItems(cityId, meetingId),
    ]);
    if (!row?.fileKey || !isSheetMediaType(row.mediaType)) throw new Error('No sheet uploaded for this meeting');
    if (!meeting || !city) throw new Error('Council meeting not found');
    const mayor = people.find(p => p.roles.some(r => isMayorRole(r) && isRoleActiveAt(r, meeting.dateTime)));
    const body: Omit<ReadAttendanceSheetRequest, 'callbackUrl'> = {
        fileUrl: await presignedGetUrl(row.fileKey, SHEET_URL_TTL_SECONDS),
        mediaType: row.mediaType,
        cityName: city.name,
        cityLanguage: city.language,
        administrativeBodyName: meeting.administrativeBody?.name ?? null,
        date: meeting.dateTime.toISOString().split('T')[0],
        roster: buildSpeakerRoster(people, meeting.dateTime, meeting.administrativeBodyId),
        agendaItems,
        mayorId: mayor?.id,
        // A read again is a person asking for a new reading; the task server would
        // otherwise answer from the reading it cached for the same file.
        ...(options.forceRead ? { forceRead: true } : {}),
    };
    // A read that succeeded does not block the next: a person asks for a new
    // reading, or uploaded a new file. A read still running does.
    const task = await startTask('readAttendanceSheet', body, meetingId, cityId, { force: true });
    await setSheetTask(cityId, meetingId, task.id);
    return task;
}

/**
 * The object key a sheet request's signed URL names. A virtual-hosted URL
 * (`https://<bucket>.<host>/<key>`) carries the key as its whole path; a
 * path-style one (`https://<host>/<bucket>/<key>`, as a MinIO setup or a bucket
 * name with a dot gets) carries the bucket first, and it is dropped.
 */
export function sheetKeyOfRequest(requestBody: string, bucket: string): string | null {
    try {
        const { fileUrl } = JSON.parse(requestBody) as { fileUrl?: unknown };
        if (typeof fileUrl !== 'string') return null;
        const path = decodeURIComponent(new URL(fileUrl).pathname.replace(/^\//, ''));
        return path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path;
    } catch {
        return null;
    }
}

export async function handleReadAttendanceSheetResult(taskId: string, result: ReadAttendanceSheetResult) {
    const task = await prisma.taskStatus.findUnique({ where: { id: taskId } });
    if (!task) throw new Error('Task not found');
    if (!isMeetingFactsReading(result.reading)) throw new Error('The result carries no reading');
    const fileKey = sheetKeyOfRequest(task.requestBody, env.DO_SPACES_BUCKET);
    if (!fileKey) throw new Error('The request names no sheet file');
    const outcome = await storeFactSourceReading(task.cityId, task.councilMeetingId, DataSource.sheet, result.reading, { taskId, readerVersion: task.version != null ? String(task.version) : null, fileKey });
    console.log(`Attendance sheet of ${task.cityId}/${task.councilMeetingId}: reading ${outcome}`);
    // The reading counts at once: the meeting is derived again from it, and an
    // earlier reading of the same file stops counting now.
    if (outcome === 'stored') await rederiveMeetingQuietly(task.cityId, task.councilMeetingId);
}

/** The transcript facts pass on its own: the fixTranscript request, which already carries the roster and the agenda items. */
export async function requestReadTranscriptFactsInternal(cityId: string, meetingId: string) {
    const body: Omit<ReadTranscriptFactsRequest, 'callbackUrl'> = await getFixTranscriptRequestBody(meetingId, cityId);
    return startTask('readTranscriptFacts', body, meetingId, cityId, { force: true });
}

export async function handleReadTranscriptFactsResult(taskId: string, result: ReadTranscriptFactsResult) {
    const task = await prisma.taskStatus.findUnique({ where: { id: taskId } });
    if (!task) throw new Error('Task not found');
    await storeTranscriptFacts(task.cityId, task.councilMeetingId, result.reading, { taskId, readerVersion: task.version != null ? String(task.version) : null });
}

/**
 * Keep what the transcript states and derive the meeting again. Shared by the
 * standalone task and the fixTranscript result, which carries the same reading
 * beside its text corrections.
 */
export async function storeTranscriptFacts(cityId: string, meetingId: string, reading: MeetingFactsReading | undefined, meta: { taskId: string; readerVersion: string | null }): Promise<void> {
    if (!isMeetingFactsReading(reading)) {
        console.log(`Transcript facts of ${cityId}/${meetingId}: no reading in the result`);
        return;
    }
    await storeFactSourceReading(cityId, meetingId, DataSource.transcript, reading, meta);
    console.log(`Transcript facts of ${cityId}/${meetingId}: ${reading.rollCall?.entries.length ?? 0} roll-call entries, ${reading.attendanceChanges.length} changes, ${reading.votes.length} vote statements`);
    await rederiveMeetingQuietly(cityId, meetingId);
}

/** Whether the meeting's people can be matched at all; a city with nobody in it has nothing to read into. */
export async function meetingHasRoster(cityId: string, meetingId: string): Promise<boolean> {
    const meeting = await getCouncilMeetingDirect(cityId, meetingId);
    if (!meeting) return false;
    return (await getPeopleForMeeting(cityId, meeting.administrativeBodyId)).length > 0;
}
