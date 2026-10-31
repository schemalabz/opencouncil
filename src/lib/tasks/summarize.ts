"use server";
import { Prisma } from "@prisma/client";
import { Utterance as ApiUtterance, SummarizeRequest, SummarizeResult } from "../apiTypes";
import { getTranscript } from "../db/transcript";
import { getPartiesForCity } from "../db/parties";
import { getCity } from "../db/cities";
import { getCouncilMeeting, setMeetingReleasedWithEffects } from "../db/meetings";
import { meetingHasSucceededTask } from "../db/tasksInternal";
import { pipelineRunsUnattended } from "@/lib/utils/bodyTier";
import prisma from "../db/prisma";
import { revalidateMeeting } from "../cache";
import { getAvailableSpeakerSegmentIds, saveSubjectsForMeeting } from "../db/utils";
import { requestSummarizeInternal } from "./summarizeInternal";
import { withUserAuthorizedToEdit } from "../auth";
import { taskScope } from "./types";
import { after } from "next/server";
import * as z from "zod";
import { generateImagesForMeeting } from "../subjectImages";

// A Server Action has no runtime types. Both fields land in the summarize
// prompt, so they are bounded here.
const summarizeInputSchema = z.object({
    requestedSubjects: z.array(z.string().max(500)).max(100),
    additionalInstructions: z.string().max(4000).optional(),
});

/**
 * Browser-facing entry point for the admin panel's summarize button. Callers
 * with no session, such as the MCP admin tools, use requestSummarizeInternal.
 * A rejected input comes back as a value: production Next hides the message
 * of an error that a Server Action throws.
 */
export async function requestSummarize(cityId: string, councilMeetingId: string, requestedSubjects: string[] = [], additionalInstructions?: string, {
    force = false
}: {
    force?: boolean;
} = {}): Promise<{ ok: true } | { ok: false; message: string }> {
    await withUserAuthorizedToEdit(taskScope({ type: 'summarize', cityId, councilMeetingId }));
    const input = summarizeInputSchema.safeParse({ requestedSubjects, additionalInstructions });
    if (!input.success) {
        const issue = input.error.issues[0];
        return { ok: false, message: `${issue.path.join('.')}: ${issue.message}` };
    }
    await requestSummarizeInternal(cityId, councilMeetingId, input.data.requestedSubjects, input.data.additionalInstructions, { force });
    return { ok: true };
}

export async function handleSummarizeResult(taskId: string, response: SummarizeResult) {
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

    const { councilMeeting } = task;

    const availableSpeakerSegmentIds = await getAvailableSpeakerSegmentIds(councilMeeting.id, councilMeeting.cityId);

    // Pre-fetch all topics to avoid repeated queries
    const allTopicNames = new Set<string>();
    for (const segmentSummary of response.speakerSegmentSummaries) {
        if (segmentSummary.topicLabels) {
            segmentSummary.topicLabels.forEach(label => allTopicNames.add(label));
        }
    }

    const topics = await prisma.topic.findMany({
        where: { name: { in: Array.from(allTopicNames) }, deprecated: false }
    });
    const topicByName = new Map(topics.map(t => [t.name, t]));

    // The upserts below keep a label for a topic that is no longer assigned to its
    // segment, so the old labels are deleted first. The delete is in the same
    // transaction, so that a failure keeps the old labels.
    const operations: Prisma.PrismaPromise<unknown>[] = [
        prisma.topicLabel.deleteMany({
            where: { speakerSegment: { meetingId: councilMeeting.id, cityId: councilMeeting.cityId } }
        }),
    ];

    for (const segmentSummary of response.speakerSegmentSummaries) {
        if (!availableSpeakerSegmentIds.includes(segmentSummary.speakerSegmentId)) {
            console.log(`Speaker segment ${segmentSummary.speakerSegmentId} not found`);
            continue;
        }

        // Summary upsert
        operations.push(
            prisma.summary.upsert({
                where: {
                    speakerSegmentId: segmentSummary.speakerSegmentId
                },
                update: {
                    text: segmentSummary.summary || '',
                    type: segmentSummary.type === "PROCEDURAL" ? "procedural" : "substantive"
                },
                create: {
                    text: segmentSummary.summary || '',
                    type: segmentSummary.type === "PROCEDURAL" ? "procedural" : "substantive",
                    speakerSegment: { connect: { id: segmentSummary.speakerSegmentId } }
                }
            })
        );

        // Topic label upserts
        if (segmentSummary.topicLabels) {
            for (const topicLabel of segmentSummary.topicLabels) {
                const topic = topicByName.get(topicLabel);
                if (topic) {
                    operations.push(
                        prisma.topicLabel.upsert({
                            where: {
                                id: `${segmentSummary.speakerSegmentId}_${topic.id}`
                            },
                            update: {},
                            create: {
                                id: `${segmentSummary.speakerSegmentId}_${topic.id}`,
                                speakerSegment: { connect: { id: segmentSummary.speakerSegmentId } },
                                topic: { connect: { id: topic.id } }
                            }
                        })
                    );
                } else {
                    console.log(`Topic not found: ${topicLabel}`);
                }
            }
        }
    }

    // Execute all operations in a single transaction
    // Note: Array-based $transaction doesn't support timeout in Prisma 5
    // With batching, this should complete quickly (< 10 seconds)
    await prisma.$transaction(operations);

    // Save subjects: matches by the id the task hands back, then name, then agenda
    // position, so existing IDs survive (avoids ES orphans). The discussion tags go in
    // with the subjects: they must commit together, or the search index keeps the
    // pre-tagging discussion metrics (elasticsearch/README.md). A response without
    // tags passes an empty list, so that the tags of the previous run are still removed.
    await saveSubjectsForMeeting(
        response.subjects,
        councilMeeting.cityId,
        councilMeeting.id,
        response.utteranceDiscussionStatuses ?? []
    );

    console.log(`Saved summaries and topic labels for meeting ${councilMeeting.id}`);

    // Bust the meeting/subject cache now that all summarize results are
    // persisted. The notifications follow once the task reads as succeeded
    // (tasks.ts), so their first readers open the new content.
    revalidateMeeting(councilMeeting.cityId, councilMeeting.id);

    // Illustrations for the non-agenda subjects, which only exist now. Agenda
    // subjects already have theirs and are skipped. Through after(): the
    // callback must not wait on Gemini, and minutes of Gemini calls must
    // outlive the response rather than escape it. Each failure alerts on its own.
    after(() => generateImagesForMeeting(councilMeeting.cityId, councilMeeting.id));

    // A pipeline that runs with no operator (#829) releases the meeting
    // itself, once: the first summary is in, so the meeting goes public. It
    // goes public before the task reads as succeeded, so the notifications
    // that follow (see notifySubscribersOfTask) find it released, and a
    // reader who opens their link finds the page. A hidden meeting that has
    // a summary already was hidden by an admin after it: a later summary
    // does not undo that choice. A primary body's meeting waits for an admin.
    // A failure here must not fail the task: the summary is saved, and an
    // admin can release the meeting by hand.
    if (pipelineRunsUnattended(councilMeeting.administrativeBody) && !councilMeeting.released
        && !(await meetingHasSucceededTask(councilMeeting.cityId, councilMeeting.id, 'summarize'))) {
        try {
            await setMeetingReleasedWithEffects(councilMeeting.cityId, councilMeeting.id, true);
            console.log(`Released ${councilMeeting.cityId}/${councilMeeting.id} after its summary (unattended pipeline)`);
        } catch (error) {
            console.error(`Failed to release ${councilMeeting.cityId}/${councilMeeting.id} after its summary:`, error);
        }
    }
}
