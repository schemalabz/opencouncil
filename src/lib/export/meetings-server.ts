"use server";

import { getCouncilMeeting } from '@/lib/db/meetings';
import { getTranscript } from '@/lib/db/transcript';
import { getCity } from '@/lib/db/cities';
import { getPeopleForCity } from '@/lib/db/people';
import { renderDocx } from '@/components/meetings/docx/CouncilMeetingDocx';
import { Packer } from 'docx';

/**
 * Generate a DOCX buffer for a meeting transcript on the server side.
 * This is used for automated transcript sending to municipalities.
 */
export async function generateMeetingDocxBuffer(
    cityId: string,
    meetingId: string
): Promise<Buffer> {
    const [meeting, transcript, city, people] = await Promise.all([
        getCouncilMeeting(cityId, meetingId),
        getTranscript(meetingId, cityId),
        getCity(cityId),
        getPeopleForCity(cityId),
    ]);

    if (!meeting) {
        throw new Error(`Meeting not found: ${cityId}/${meetingId}`);
    }

    if (!city) {
        throw new Error(`City not found: ${cityId}`);
    }

    if (!transcript || transcript.length === 0) {
        throw new Error(`Transcript not found for meeting: ${cityId}/${meetingId}`);
    }

    const doc = await renderDocx({
        city,
        meeting,
        transcript,
        people,
    });

    const blob = await doc.save();
    const arrayBuffer = await blob.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
