import { db } from "./db";

export interface CouncilMeetingWithAdminBodyAndSubjects {
    id: string;
    title: string;
    date: Date;
    cityId: string;
    // Add other properties as needed
}

export async function getMeetingsByCity(
    cityId: string,
    page: number = 1,
    pageSize: number = 10
) {
    const skip = (page - 1) * pageSize;
    
    const meetings = await db.meeting.findMany({
        where: { cityId },
        skip,
        take: pageSize,
        orderBy: { date: 'desc' }
    });

    const totalCount = await db.meeting.count({
        where: { cityId }
    });

    return { meetings, totalCount };
}