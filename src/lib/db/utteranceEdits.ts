/**
 * The edits of a meeting's transcript as a record: who changed which
 * utterance, from what to what, and for a task edit, which run (#876). The
 * admin MCP tools list them and revert one.
 *
 * Server-only and unauthenticated: the MCP data layer authorizes first.
 */
import "server-only";
import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { ConflictError, NotFoundError } from '@/lib/api/errors';
import type { FixFromMinutesResult, MinutesSource } from '@/lib/apiTypes';

const editSelect = {
    id: true,
    utteranceId: true,
    beforeText: true,
    afterText: true,
    editedBy: true,
    userId: true,
    taskId: true,
    createdAt: true,
    // The type only: a run's result holds every correction of the run, so
    // listTranscriptEdits reads each result once, not once per edit.
    task: { select: { type: true } },
    utterance: { select: { startTimestamp: true, text: true, speakerSegment: { select: { cityId: true, meetingId: true } } } },
} satisfies Prisma.UtteranceEditSelect;
type EditRow = Prisma.UtteranceEditGetPayload<{ select: typeof editSelect }>;

export type TranscriptEdit = {
    id: string;
    utteranceId: string;
    /** Seconds into the recording. */
    startTimestamp: number;
    beforeText: string;
    afterText: string;
    /** The text the utterance holds now; differs from afterText when a later edit followed. */
    currentText: string;
    editedBy: 'user' | 'task';
    userId: string | null;
    taskId: string | null;
    /** The type of the task run that made a task edit; null for a user edit or a run from before taskId existed. */
    taskType: string | null;
    /** For an edit of fixFromMinutes: the turn of the minutes the wording came from. */
    source: MinutesSource | null;
    createdAt: Date;
};

/** By task id, then by utterance id: the turn of the minutes behind each correction of a run. */
type MinutesSources = Map<string, Map<string, MinutesSource>>;

/**
 * The turn of the minutes behind each correction of the fixFromMinutes runs
 * among `rows`. One read per run: a run's stored result lists all of its
 * corrections, so reading it per edit would load it once for each of them.
 */
async function minutesSourcesOf(rows: EditRow[]): Promise<MinutesSources> {
    const runIds = [...new Set(rows.filter(row => row.task?.type === 'fixFromMinutes').map(row => row.taskId!))];
    if (runIds.length === 0) return new Map();
    const runs = await prisma.taskStatus.findMany({ where: { id: { in: runIds } }, select: { id: true, responseBody: true } });
    return new Map(runs.map(run => [run.id, sourcesOfResult(run.responseBody)]));
}

function sourcesOfResult(responseBody: string | null): Map<string, MinutesSource> {
    if (!responseBody) return new Map();
    try {
        const result = JSON.parse(responseBody) as Partial<FixFromMinutesResult>;
        return new Map((result.updateUtterances ?? []).map(update => [update.utteranceId, update.source]));
    } catch {
        return new Map();
    }
}

function toTranscriptEdit(row: EditRow, sources: MinutesSources): TranscriptEdit {
    return {
        id: row.id,
        utteranceId: row.utteranceId,
        startTimestamp: row.utterance.startTimestamp,
        beforeText: row.beforeText,
        afterText: row.afterText,
        currentText: row.utterance.text,
        editedBy: row.editedBy,
        userId: row.userId,
        taskId: row.taskId,
        taskType: row.task?.type ?? null,
        source: (row.taskId && sources.get(row.taskId)?.get(row.utteranceId)) || null,
        createdAt: row.createdAt,
    };
}

/**
 * The edits of a meeting, oldest first, or the edits of one task run. Every
 * row names the run it came from, so the diff after transcribe, after
 * fixTranscript and after fixFromMinutes can be told apart.
 */
export async function listTranscriptEdits(cityId: string, meetingId: string, taskId?: string): Promise<TranscriptEdit[]> {
    const rows = await prisma.utteranceEdit.findMany({
        where: {
            utterance: { speakerSegment: { cityId, meetingId } },
            ...(taskId && { taskId }),
        },
        select: editSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const sources = await minutesSourcesOf(rows);
    return rows.map(row => toTranscriptEdit(row, sources));
}

/**
 * Puts the text from before an edit back, as a new edit by the caller. The
 * record stays complete: nothing is deleted. The utterance becomes the
 * caller's, so no automatic pass rewrites it; its speaker is untouched.
 */
export async function revertTranscriptEdit(
    cityId: string,
    meetingId: string,
    editId: string,
    userId: string | null
): Promise<TranscriptEdit> {
    const edit = await prisma.utteranceEdit.findUnique({ where: { id: editId }, select: editSelect });
    if (!edit || edit.utterance.speakerSegment.cityId !== cityId || edit.utterance.speakerSegment.meetingId !== meetingId) {
        throw new NotFoundError('Transcript edit not found');
    }

    // Compare-and-set: the revert writes only while the utterance holds the
    // text it read, so its own record names what it overwrote. An edit that
    // lands in between wins, and the caller lists the edits again.
    const currentText = edit.utterance.text;
    const revert = await prisma.$transaction(async (tx) => {
        const { count } = await tx.utterance.updateMany({
            where: { id: edit.utteranceId, text: currentText },
            data: { text: edit.beforeText, lastModifiedBy: 'user' },
        });
        if (count === 0) {
            throw new ConflictError('The utterance changed after the edit list was read. List the edits again and revert from the new list.');
        }
        return tx.utteranceEdit.create({
            data: {
                utteranceId: edit.utteranceId,
                beforeText: currentText,
                afterText: edit.beforeText,
                editedBy: 'user',
                userId,
            },
            select: editSelect,
        });
    });
    return toTranscriptEdit({ ...revert, utterance: { ...revert.utterance, text: edit.beforeText } }, new Map());
}
