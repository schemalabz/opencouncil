"use server";

import { ProcessAgendaResult, Subject } from "../apiTypes";
import prisma from "../db/prisma";
import { revalidateMeeting } from "../cache";
import { saveSubjectsForMeeting } from "../db/utils";
import { withUserAuthorizedToEdit } from "../auth";
import { taskScope } from "./types";
import { after } from "next/server";
import { generateImagesForMeeting } from "../subjectImages";
import { requestProcessAgendaInternal } from "./processAgendaInternal";
import { meetingLabelInCity } from '@/lib/meetingName';
import type { MeetingKind } from '@prisma/client';
import { MEETING_KINDS, recordsGreekCodeFacts } from '@/lib/meetingLifecycleRules';
import { checkAgendaIdentity } from '@/lib/agendaMeetingRecord';
import { formatClockTime, localCalendarDate } from '@/lib/formatters/time';

/** The items that processAgenda writes itself, for a numbered re-run to retire. */
const UNNUMBERED_ITEMS = Object.values(MEETING_KINDS).flatMap((k) => k.unnumberedItem ? [k.unnumberedItem] : []);

/** The subject for an agenda item that has no number (`MEETING_KINDS.unnumberedItem`). */
function unnumberedItemSubject({ name, description }: { name: string; description: string }): Subject {
    return {
        name,
        description,
        agendaItemTitle: name,
        agendaSection: null,
        agendaItemIndex: 1,
        introducedByPersonId: null,
        speakerContributions: [],
        topicImportance: 'high',
        proximityImportance: 'none',
        location: null,
        topicLabel: null,
        context: null,
    };
}

/**
 * User-facing Server Action that checks authorization before processing.
 */
export async function requestProcessAgenda(agendaUrl: string, councilMeetingId: string, cityId: string, {
    force = false
}: {
    force?: boolean;
} = {}) {
    await withUserAuthorizedToEdit(taskScope({ type: 'processAgenda', cityId, councilMeetingId }));
    return requestProcessAgendaInternal(agendaUrl, councilMeetingId, cityId, { force });
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
                    city: true,
                    continuationOf: { select: { kind: true } }
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
        return;
    }

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

    // A Λογοδοσία has one item, the accountability report, and its agenda
    // does not number it, so the extraction finds nothing. Saving that item
    // as a high subject lets the email and Notis paths announce the meeting
    // (#308). An empty agenda of any other kind stays empty. A later part has
    // no kind of its own, so the kind of its first part counts. A meeting
    // that already took place gets no item: nothing announces it any more.
    const upcoming = task.councilMeeting.dateTime > new Date();
    const unnumberedItemOf = (kind: MeetingKind | null) =>
        kind && upcoming && response.subjects.length === 0 ? MEETING_KINDS[kind].unnumberedItem : null;
    const unnumberedItem = unnumberedItemOf(task.councilMeeting.kind ?? task.councilMeeting.continuationOf?.kind ?? null);
    const subjects = unnumberedItem ? [unnumberedItemSubject(unnumberedItem)] : response.subjects;

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
        // Numbered items replace the item, whatever the kind is now. Item 1
        // must not take its id by position, or a link to the accountability
        // report opens the first question. Only the row this handler wrote
        // matches the name and the description, so an extracted item is never retired.
        response.subjects.length > 0
            ? { pruneUnmatched: true, retire: UNNUMBERED_ITEMS }
            : { pruneUnmatched: true }
    );

    // Before the cache and the notifications below: the kind is part of the
    // derived name that both of them show.
    // The subjects are saved: nothing here may fail the task.
    if (greek && (response.meetingRecord || (response.meetingsInAgenda?.length ?? 0) > 1 || identityDifferences.length > 0)) {
        try {
            const { applyAgendaMeetingRecord } = await import('./applyAgendaMeetingRecord');
            Object.assign(task.councilMeeting, await applyAgendaMeetingRecord(task.councilMeeting, response.meetingRecord ?? null, response.meetingsInAgenda ?? [], identityDifferences));
        } catch (error) {
            console.error(`processAgenda could not apply the meeting record of ${task.councilMeeting.cityId}/${task.councilMeeting.id}:`, error);
        }
    }

    // A new meeting has no kind until the record above takes the one its
    // invitation reads. The rules of the record decide that kind, so the item
    // follows only the kind the meeting holds now: the record's, or an
    // admin's edit made while the subjects were saved.
    if (!unnumberedItem && upcoming && response.subjects.length === 0) {
        const current = await prisma.councilMeeting.findUnique({
            where: { cityId_id: { cityId: task.councilMeeting.cityId, id: task.councilMeeting.id } },
            select: { kind: true },
        });
        const unnumberedItemNow = unnumberedItemOf(current?.kind ?? null);
        if (unnumberedItemNow) {
            await saveSubjectsForMeeting([unnumberedItemSubject(unnumberedItemNow)], task.councilMeeting.cityId, task.councilMeeting.id, undefined, { pruneUnmatched: true });
        }
    }

    // Bust the meeting/subject cache now that the new agenda subjects are persisted,
    // BEFORE sending notifications below. The notification send is rate-limited
    // (~500ms/recipient), so revalidating only after it finishes would let early
    // recipients open the meeting and see stale content.
    revalidateMeeting(task.councilMeeting.cityId, task.councilMeeting.id);

    // Illustrations for the agenda subjects, days before the meeting. Through
    // after(): the callback must not wait on Gemini, and minutes of Gemini
    // calls must outlive the response rather than escape it. Each failure
    // alerts on its own.
    after(() => generateImagesForMeeting(task.councilMeeting.cityId, task.councilMeeting.id));

    // Create notifications if administrative body allows it
    const adminBody = task.councilMeeting.administrativeBody;
    if (adminBody && adminBody.notificationBehavior !== 'NOTIFICATIONS_DISABLED') {
        const { createNotificationsForMeeting } = await import('../db/notifications');
        const { releaseNotifications } = await import('../notifications/deliver');
        const { sendNotificationsCreatedAdminAlert, sendNotificationsSentAdminAlert } = await import('../discord');

        try {
            const stats = await createNotificationsForMeeting(
                task.councilMeeting.cityId,
                task.councilMeeting.id,
                'beforeMeeting'
            );

            console.log(`Created ${stats.notificationsCreated} beforeMeeting notifications for ${stats.subjectsTotal} subjects`);

            const autoSend = adminBody.notificationBehavior === 'NOTIFICATIONS_AUTO';

            // Send Discord admin alert about notification creation
            if (stats.notificationsCreated > 0) {
                sendNotificationsCreatedAdminAlert({
                    cityName: task.councilMeeting.city.name_en,
                    meetingName: meetingLabelInCity(task.councilMeeting, 'el'),
                    notificationType: 'beforeMeeting',
                    notificationsCreated: stats.notificationsCreated,
                    subjectsTotal: stats.subjectsTotal,
                    cityId: task.councilMeeting.cityId,
                    meetingId: task.councilMeeting.id,
                    autoSend
                });
            }

            // If auto-send is enabled, release notifications immediately
            if (autoSend) {
                console.log('Auto-sending notifications...');
                const releaseResult = await releaseNotifications(stats.notificationIds);
                console.log(`Released notifications: ${releaseResult.emailsSent} emails`);

                // Send Discord admin alert about sending
                sendNotificationsSentAdminAlert({
                    cityId: task.councilMeeting.cityId,
                    meetingId: task.councilMeeting.id,
                    cityName: task.councilMeeting.city.name_en,
                    meetingName: meetingLabelInCity(task.councilMeeting, 'el'),
                    notificationCount: stats.notificationsCreated,
                    emailsSent: releaseResult.emailsSent,
                    failed: releaseResult.failed,
                    leftPending: releaseResult.leftPending
                });
            }
        } catch (error) {
            console.error('Error creating notifications after processAgenda:', error);
            // Don't throw - we don't want to fail the entire task if notifications fail
        }
    }
}
