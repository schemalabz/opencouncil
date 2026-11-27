/**
 * The database side of the correction from the municipal minutes (#876): the
 * minutes document of a meeting, the task context its handlers need, and the
 * write of one correction with its history row. The task modules in
 * `src/lib/tasks/` orchestrate; every query of the feature lives here.
 *
 * Server-only and unauthenticated: the task-server callback and the callers
 * that authorized first reach it.
 */
import "server-only";
import { Prisma } from '@prisma/client';
import prisma from './prisma';

/** Store the minutes on a meeting: the request builder and every later run read them from there. */
export async function setMunicipalMinutesUrl(cityId: string, meetingId: string, municipalMinutesUrl: string): Promise<void> {
    await prisma.councilMeeting.update({
        where: { cityId_id: { cityId, id: meetingId } },
        data: { municipalMinutesUrl },
    });
}

const minutesTaskContextSelect = {
    cityId: true,
    councilMeetingId: true,
    councilMeeting: {
        select: {
            municipalMinutesUrl: true,
            // The fields of meetingLabelInCity, for the alerts of the chain.
            name: true,
            name_en: true,
            kind: true,
            urgent: true,
            sessionNumber: true,
            dateTime: true,
            city: { select: { name_en: true, timezone: true } },
            administrativeBody: { select: { name: true, name_en: true } },
        },
    },
} satisfies Prisma.TaskStatusSelect;
export type MinutesTaskContext = Prisma.TaskStatusGetPayload<{ select: typeof minutesTaskContextSelect }>;

/** A task of the meeting, with what a step of the minutes chain needs to start the next one. */
export async function getMinutesTaskContext(taskId: string): Promise<MinutesTaskContext | null> {
    return prisma.taskStatus.findUnique({ where: { id: taskId }, select: minutesTaskContextSelect });
}

/** What became of one correction: written, or kept because a person owns the text, or its utterance is gone. */
export type MinutesCorrectionOutcome = 'written' | 'keptForPerson' | 'utteranceMissing';

/**
 * Write one correction of a fixFromMinutes run with its history row.
 *
 * - A person's text wins: an operator's edit, or a revert of an earlier
 *   correction, is never undone by a run of the minutes.
 * - The write is guarded on the text it read, so an edit by a person between
 *   the read and the write keeps its text. Spelled positively, because NOT
 *   over the nullable column would also drop the untouched utterances.
 * - The text and its history row commit together, so a correction can always
 *   be listed and reverted.
 */
export async function applyMinutesCorrection(
    taskId: string,
    update: { utteranceId: string; text: string; markUncertain: boolean }
): Promise<MinutesCorrectionOutcome> {
    const utterance = await prisma.utterance.findUnique({
        where: { id: update.utteranceId },
        select: { text: true, lastModifiedBy: true },
    });
    if (!utterance) return 'utteranceMissing';
    if (utterance.lastModifiedBy === 'user') return 'keptForPerson';

    const written = await prisma.$transaction(async (tx) => {
        const { count } = await tx.utterance.updateMany({
            where: {
                id: update.utteranceId,
                text: utterance.text,
                OR: [{ lastModifiedBy: null }, { lastModifiedBy: 'task' }],
            },
            data: { text: update.text, uncertain: update.markUncertain, lastModifiedBy: 'task' },
        });
        if (count === 0) return false;
        await tx.utteranceEdit.create({
            data: {
                utteranceId: update.utteranceId,
                beforeText: utterance.text,
                afterText: update.text,
                editedBy: 'task',
                taskId,
            },
        });
        return true;
    });
    return written ? 'written' : 'keptForPerson';
}

/**
 * The meeting has its minutes, its transcript was corrected by fixTranscript,
 * and no fixFromMinutes run has started on that transcript since. That is the
 * meeting whose automatic start of the correction was refused, for example
 * because a summarize ran at the time: a refused start leaves no task row.
 * A run of any status counts as started, so a failed run is left to the
 * operator and nothing retries in a loop.
 */
export async function minutesCorrectionNeverStarted(cityId: string, meetingId: string): Promise<boolean> {
    const meeting = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        select: { municipalMinutesUrl: true },
    });
    if (!meeting?.municipalMinutesUrl) return false;

    const lastFix = await prisma.taskStatus.findFirst({
        where: { cityId, councilMeetingId: meetingId, type: 'fixTranscript', status: 'succeeded' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
    });
    if (!lastFix) return false;

    const correction = await prisma.taskStatus.findFirst({
        where: { cityId, councilMeetingId: meetingId, type: 'fixFromMinutes', createdAt: { gt: lastFix.createdAt } },
        select: { id: true },
    });
    return correction === null;
}
