"use server";

import { withUserAuthorizedToEdit } from "../auth";
import { requestProcessAgendaInternal } from "./processAgendaInternal";
import { getSummarizeRequestBody } from "../db/utils";
import { startTask } from "./tasks";
import prisma from "../db/prisma";

export interface BatchRerunResult {
    meetingId: string;
    cityId: string;
    success: boolean;
    error?: string;
}

export async function batchRerunTask(
    cityId: string,
    meetingId: string,
    taskType: 'processAgenda' | 'summarize'
): Promise<BatchRerunResult> {
    try {
        await withUserAuthorizedToEdit({ cityId });

        if (taskType === 'processAgenda') {
            // Fetch agendaUrl from the meeting record
            const meeting = await prisma.councilMeeting.findUnique({
                where: { cityId_id: { cityId, id: meetingId } },
                select: { agendaUrl: true }
            });

            if (!meeting?.agendaUrl) {
                return { meetingId, cityId, success: false, error: 'No agenda URL' };
            }

            await requestProcessAgendaInternal(meeting.agendaUrl, meetingId, cityId, { force: true });
        } else {
            const body = await getSummarizeRequestBody(meetingId, cityId, []);
            await startTask('summarize', body, meetingId, cityId, { force: true });
        }

        return { meetingId, cityId, success: true };
    } catch (error) {
        return {
            meetingId,
            cityId,
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
