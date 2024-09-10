"use server";
import prisma from "@/lib/db/prisma";
export async function getPilotStats(): Promise<{
    wordCount: number;
    minutesCount: number;
    peopleCount: number;
    meetingsCount: number;
}> {
    const wordCount = await prisma.word.count();
    const speakerSegments = await prisma.speakerSegment.findMany();
    const minutesCount = Math.round(speakerSegments.reduce((acc, segment) =>
        acc + (segment.endTimestamp - segment.startTimestamp), 0) / 60);
    const peopleCount = await prisma.person.count();
    const meetingsCount = await prisma.councilMeeting.count();

    return {
        wordCount,
        minutesCount,
        peopleCount,
        meetingsCount,
    }
}
