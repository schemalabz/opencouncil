import prisma from './prisma';
import { buildSubjectsByTopicsWhere } from './subject';

export interface WelcomeBriefData {
    cityName: string;
    totalMeetingCount: number;
    matchedSubjectCount: number;
    matchedSubjects: Array<{
        subjectName: string;
        description: string | null;
        topicName: string;
        meetingDate: Date;
        meetingName: string;
        hot: boolean;
        context: string | null;
    }>;
}

export async function getSubjectsForWelcomeBrief(
    cityId: string,
    topicIds: string[],
    since: Date
): Promise<WelcomeBriefData> {
    const city = await prisma.city.findUnique({ where: { id: cityId }, select: { name: true } });

    if (topicIds.length === 0) {
        return {
            cityName: city?.name ?? cityId,
            totalMeetingCount: 0,
            matchedSubjectCount: 0,
            matchedSubjects: [],
        };
    }

    const [totalMeetingCount, subjects] = await Promise.all([
        prisma.councilMeeting.count({
            where: { cityId, released: true, dateTime: { gte: since } },
        }),
        prisma.subject.findMany({
            where: buildSubjectsByTopicsWhere({ cityId, since, topicIds }),
            include: {
                councilMeeting: { select: { dateTime: true, name: true } },
                topic: { select: { name: true } },
            },
            orderBy: { councilMeeting: { dateTime: 'desc' } },
            take: 20,
        }),
    ]);

    const matchedSubjects = subjects.map(s => ({
        subjectName: s.name,
        description: s.description,
        topicName: s.topic?.name ?? '',
        meetingDate: s.councilMeeting?.dateTime ?? new Date(),
        meetingName: s.councilMeeting?.name ?? '',
        hot: s.hot,
        context: s.context,
    }));

    return {
        cityName: city?.name ?? cityId,
        totalMeetingCount,
        matchedSubjectCount: subjects.length,
        matchedSubjects,
    };
}
