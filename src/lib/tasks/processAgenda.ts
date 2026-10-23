"use server";

import { ProcessAgendaResult } from "../apiTypes";
import prisma from "../db/prisma";
import { revalidateMeeting } from "../cache";
import { saveSubjectsForMeeting } from "../db/utils";
import { withUserAuthorizedToEdit } from "../auth";
import { taskScope } from "./types";
import { after } from "next/server";
import { generateImagesForMeeting } from "../subjectImages";
import { requestProcessAgendaInternal } from "./processAgendaInternal";
import { meetingLabelInCity, meetingNameInCity } from '@/lib/meetingName';
import { recordsGreekCodeFacts } from '@/lib/meetingLifecycleRules';
import { checkAgendaIdentity, describeAgendaRead, type AgendaRecordReconciliation } from '@/lib/agendaMeetingRecord';
import { formatClockTime, localCalendarDate } from '@/lib/formatters/time';
import { errorMessage } from '@/lib/utils/errors';
import { sendAgendaReadingAlert, sendTaskAdminAlert } from '@/lib/discord';
import { webUrl } from '@/lib/zod-schemas/primitives';

/**
 * User-facing Server Action that checks authorization before processing.
 * A rejected URL comes back as a value: production Next hides the message of
 * an error that a Server Action throws.
 */
export async function requestProcessAgenda(agendaUrl: string, councilMeetingId: string, cityId: string, {
    force = false
}: {
    force?: boolean;
} = {}): Promise<{ ok: true } | { ok: false; message: string }> {
    await withUserAuthorizedToEdit(taskScope({ type: 'processAgenda', cityId, councilMeetingId }));
    // The task server fetches this URL, so the same rule as the REST and MCP
    // paths applies: http(s) only.
    const url = webUrl().safeParse(agendaUrl);
    if (!url.success) {
        return { ok: false, message: 'The agenda URL must start with http:// or https://' };
    }
    await requestProcessAgendaInternal(url.data, councilMeetingId, cityId, { force });
    return { ok: true };
}

export async function handleProcessAgendaResult(taskId: string, response: ProcessAgendaResult) {
    const task = await prisma.taskStatus.findUnique({
        where: {
            id: taskId
        },
        include: {
            councilMeeting: {
                include: {
                    administrativeBody: true,
                    city: true
                }
            }
        }
    });

    if (!task) {
        throw new Error('Task not found');
    }

    // A success result with an empty `subjects` array is a valid outcome:
    // some agendas (e.g. λογοδοσία / accountability sessions) genuinely have no
    // extractable subjects. The backend reports success with `{ subjects: [] }`,
    // so this must NOT be treated as a failure.
    //
    // We distinguish two cases:
    //   - subjects is an array (including []): authoritative result → replace.
    //   - subjects missing/not an array: malformed/partial success payload →
    //     skip destructive replacement to avoid silently wiping existing agenda
    //     data, and do not throw (which would flip the succeeded task to failed).
    if (!Array.isArray(response?.subjects)) {
        console.warn(
            `processAgenda result for task ${taskId} has no subjects array (got ${typeof response?.subjects}); ` +
            `skipping subject replacement to avoid data loss. Task remains succeeded.`
        );
        await reportAgenda(taskId, task.councilMeeting, {
            details: [{ name: 'Subjects', value: 'not replaced: the result holds no subjects array', inline: true }],
            problems: [],
        });
        return;
    }

    const subjects = response.subjects;

    // A document from another municipality must not replace this meeting's
    // subjects or notify its subscribers. Throwing marks the task failed, with
    // the reason, before anything is saved. The record of a meeting follows
    // the Greek Code, and the names compare as Greek text («Град Београд» is
    // no «Grad Beograd» to it), so only a Greek city is checked and filled.
    const greek = recordsGreekCodeFacts(task.councilMeeting.city.realm);
    let identityDifferences: string[] = [];
    if (greek && response.meetingsInAgenda?.length) {
        const { councilMeeting } = task;
        const otherCities = await prisma.city.findMany({
            where: { realm: councilMeeting.city.realm, id: { not: councilMeeting.cityId } },
            select: { name_municipality: true },
        });
        const identity = checkAgendaIdentity({
            municipality: councilMeeting.city.name_municipality,
            date: localCalendarDate(councilMeeting.dateTime, councilMeeting.city.timezone),
            time: formatClockTime(councilMeeting.dateTime, councilMeeting.city.timezone),
        }, response.meetingsInAgenda, otherCities.map((c) => c.name_municipality));
        if (identity.refusal) {
            throw new Error(`processAgenda refused the agenda of ${councilMeeting.cityId}/${councilMeeting.id}: ${identity.refusal}. Nothing was saved.`);
        }
        identityDifferences = identity.differences;
    }

    // The agenda is authoritative, so saveSubjectsForMeeting both matches and
    // prunes: it keeps a subject's id when the incoming set still contains it
    // (by name first, so a renumbered agenda keeps each id with its own
    // subject; by index second, so a reworded item keeps its slot), and
    // deletes what nothing accounts for — with the auto highlights of the
    // pruned rows, which the SetNull relation would otherwise orphan.
    //
    // This runs in the callback, not at dispatch, so nothing is removed until
    // new results are ready to replace it — a failed dispatch costs no data.
    //
    // Deleting every subject first (what this did before) defeated the
    // matching entirely: nothing was left to match, so every subject came
    // back with a fresh id. Subject ids are public — in shared URLs, in the
    // search index, in notification links already sent — so a re-run silently
    // broke all of them. Re-summarizing was already correct, because it does
    // not pre-delete.
    await saveSubjectsForMeeting(
        subjects,
        task.councilMeeting.cityId,
        task.councilMeeting.id,
        undefined,
        { pruneUnmatched: true }
    );

    // Before the cache and the success alert below: the kind is part of the
    // derived name that the meeting page and the alert show.
    // The subjects are saved: nothing here may fail the task.
    let written: AgendaRecordReconciliation['patch'] = {};
    let problems: string[] = [];
    if (greek && (response.meetingRecord || (response.meetingsInAgenda?.length ?? 0) > 1 || identityDifferences.length > 0)) {
        try {
            const { applyAgendaMeetingRecord } = await import('./applyAgendaMeetingRecord');
            const applied = await applyAgendaMeetingRecord(task.councilMeeting, response.meetingRecord ?? null, response.meetingsInAgenda ?? [], identityDifferences);
            Object.assign(task.councilMeeting, applied.written);
            written = applied.written;
            problems = applied.problems;
        } catch (error) {
            console.error(`processAgenda could not apply the meeting record of ${task.councilMeeting.cityId}/${task.councilMeeting.id}:`, error);
            problems = [`the meeting record was not applied: ${errorMessage(error)}`];
        }
    }
    // The task's own success alert (discordAlertMode: handlerReportsSuccess),
    // after the write, so that it names the meeting by its new title.
    await reportAgenda(taskId, task.councilMeeting, {
        details: [
            ...(greek && response.meetingRecord
                ? [{ name: 'From the invitation', value: describeAgendaRead(response.meetingRecord, written) }]
                : []),
            { name: 'Subjects', value: String(subjects.length), inline: true },
        ],
        problems,
    });

    // Bust the meeting/subject cache now that the new agenda subjects are
    // persisted. The notifications follow once the task reads as succeeded
    // (tasks.ts), so their first readers open the new content.
    revalidateMeeting(task.councilMeeting.cityId, task.councilMeeting.id);

    // Illustrations for the agenda subjects, days before the meeting. Through
    // after(): the callback must not wait on Gemini, and minutes of Gemini
    // calls must outlive the response rather than escape it. Each failure
    // alerts on its own.
    after(() => generateImagesForMeeting(task.councilMeeting.cityId, task.councilMeeting.id));
}

/**
 * The success alert of the task, in the format of every task alert, with what
 * the result held. A problem for a person to decide goes in its own alert.
 */
async function reportAgenda(
    taskId: string,
    meeting: Parameters<typeof meetingNameInCity>[0] & { id: string; cityId: string; city: { name_en: string } },
    { details, problems }: { details: { name: string; value: string; inline?: boolean }[]; problems: string[] },
) {
    // The subjects are saved: an alert that fails must not fail the task.
    try {
        await sendTaskAdminAlert({
            status: 'completed',
            taskType: 'processAgenda',
            cityName: meeting.city.name_en,
            meetingName: meetingLabelInCity(meeting, 'en'),
            taskId,
            cityId: meeting.cityId,
            meetingId: meeting.id,
            details,
        });
        if (problems.length > 0) {
            await sendAgendaReadingAlert({
                cityId: meeting.cityId,
                cityName: meeting.city.name_en,
                meetingId: meeting.id,
                meetingName: meetingNameInCity(meeting, 'el'),
                problems,
            });
        }
    } catch (error) {
        console.error('Failed to send the processAgenda alerts:', error);
    }
}
