import prisma from "./prisma";
import { Prisma } from "@prisma/client";

export interface GlobalKPIs {
    cityCount: number;
    meetingCount: number;
    hoursTranscribed: number;
    wordCount: number;
    speakerCount: number;
}

export interface TopicDistributionItem {
    topicId: string;
    topicName: string;
    colorHex: string;
    speakingSeconds: number;
    percentage: number;
}

export interface PartyDistributionItem {
    partyId: string;
    partyName: string;
    colorHex: string;
    speakingSeconds: number;
    percentage: number;
}

export interface MonthlyGrowthItem {
    month: string; // YYYY-MM
    meetingCount: number;
    totalSeconds: number;
}

export interface CityLeaderboardItem {
    cityId: string;
    cityName: string;
    totalSeconds: number;
    meetingCount: number;
}

export async function getGlobalKPIs(): Promise<GlobalKPIs> {
    const [
        cityCount,
        meetingCount,
        segmentAgg,
        wordCount,
        speakersAgg
    ] = await Promise.all([
        // Number of cities with at least one released meeting
        prisma.city.count({
            where: {
                councilMeetings: {
                    some: {
                        released: true,
                    },
                },
            },
        }),

        // Total released meetings
        prisma.councilMeeting.count({
            where: {
                released: true,
            },
        }),

        // Transcribed hours: sum(endTimestamp) - sum(startTimestamp) for substantive segments in released meetings
        prisma.speakerSegment.aggregate({
            where: {
                meeting: {
                    released: true,
                },
                summary: {
                    type: {
                        not: "procedural"
                    }
                }
            },
            _sum: {
                endTimestamp: true,
                startTimestamp: true,
            },
        }),

        // Total words in substantive segments of released meetings
        prisma.word.count({
            where: {
                utterance: {
                    speakerSegment: {
                        meeting: {
                            released: true,
                        },
                        summary: {
                            type: {
                                not: "procedural"
                            }
                        }
                    }
                }
            }
        }),

        // Total unique speakers
        // Prisma does not support count distinct on relation directly in aggregate.
        // So we fetch distinct personIds.
        prisma.speakerTag.findMany({
            where: {
                personId: { not: null },
                speakerSegments: {
                    some: {
                        meeting: {
                            released: true,
                        },
                        summary: {
                            type: {
                                not: "procedural"
                            }
                        }
                    }
                }
            },
            distinct: ['personId'],
            select: {
                personId: true
            }
        })
    ]);

    const sumEnd = segmentAgg._sum.endTimestamp || 0;
    const sumStart = segmentAgg._sum.startTimestamp || 0;
    const totalSeconds = sumEnd - sumStart;
    const hoursTranscribed = Math.round(totalSeconds / 3600);

    return {
        cityCount,
        meetingCount,
        hoursTranscribed,
        wordCount,
        speakerCount: speakersAgg.length,
    };
}

export async function getTopicDistribution(cityId?: string): Promise<TopicDistributionItem[]> {
    const cityFilter = cityId ? Prisma.sql`AND ss."cityId" = ${cityId}` : Prisma.empty;

    const result = await prisma.$queryRaw<Array<{
        topicId: string;
        topicName: string;
        colorHex: string;
        speakingSeconds: number;
    }>>`
    SELECT
      t.id as "topicId",
      t.name as "topicName",
      t."colorHex" as "colorHex",
      CAST(SUM(ss."endTimestamp" - ss."startTimestamp") AS FLOAT) as "speakingSeconds"
    FROM "TopicLabel" tl
    JOIN "SpeakerSegment" ss ON tl."speakerSegmentId" = ss.id
    JOIN "Topic" t ON tl."topicId" = t.id
    JOIN "CouncilMeeting" cm ON ss."meetingId" = cm.id AND ss."cityId" = cm."cityId"
    LEFT JOIN "Summary" s ON s."speakerSegmentId" = ss.id
    WHERE cm.released = true
      AND (s.type IS NULL OR s.type != 'procedural')
      ${cityFilter}
    GROUP BY t.id, t.name, t."colorHex"
    ORDER BY "speakingSeconds" DESC
  `;

    const total = result.reduce((acc, row) => acc + (row.speakingSeconds || 0), 0);
    return result.map(row => ({
        ...row,
        percentage: total > 0 ? Math.round((row.speakingSeconds / total) * 100) : 0
    }));
}

export async function getPartyDistribution(cityId?: string): Promise<PartyDistributionItem[]> {
    const cityFilter = cityId ? Prisma.sql`AND ss."cityId" = ${cityId}` : Prisma.empty;

    const result = await prisma.$queryRaw<Array<{
        partyId: string;
        partyName: string;
        colorHex: string;
        speakingSeconds: number;
    }>>`
    SELECT
      p.id as "partyId",
      p.name as "partyName",
      p."colorHex" as "colorHex",
      CAST(SUM(ss."endTimestamp" - ss."startTimestamp") AS FLOAT) as "speakingSeconds"
    FROM "SpeakerSegment" ss
    JOIN "CouncilMeeting" cm ON ss."meetingId" = cm.id AND ss."cityId" = cm."cityId"
    JOIN "SpeakerTag" st ON ss."speakerTagId" = st.id
    JOIN "Role" r ON r."personId" = st."personId" AND r."cityId" = ss."cityId"
    JOIN "Party" p ON r."partyId" = p.id
    LEFT JOIN "Summary" s ON s."speakerSegmentId" = ss.id
    WHERE cm.released = true
      AND (s.type IS NULL OR s.type != 'procedural')
      ${cityFilter}
    GROUP BY p.id, p.name, p."colorHex"
    ORDER BY "speakingSeconds" DESC
  `;

    const total = result.reduce((acc, row) => acc + (row.speakingSeconds || 0), 0);
    return result.map(row => ({
        ...row,
        percentage: total > 0 ? Math.round((row.speakingSeconds / total) * 100) : 0
    }));
}

export async function getMonthlyGrowth(): Promise<MonthlyGrowthItem[]> {
    const result = await prisma.$queryRaw<Array<{
        month: string;
        meetingCount: number;
        totalSeconds: number;
    }>>`
    SELECT
      to_char(cm."dateTime", 'YYYY-MM') as month,
      CAST(COUNT(DISTINCT cm.id) AS INTEGER) as "meetingCount",
      CAST(COALESCE(SUM(ss."endTimestamp" - ss."startTimestamp"), 0) AS FLOAT) as "totalSeconds"
    FROM "CouncilMeeting" cm
    LEFT JOIN "SpeakerSegment" ss ON ss."meetingId" = cm.id AND ss."cityId" = cm."cityId"
    LEFT JOIN "Summary" s ON s."speakerSegmentId" = ss.id
    WHERE cm.released = true
      AND (s.type IS NULL OR s.type != 'procedural')
      AND cm."dateTime" >= NOW() - INTERVAL '24 months'
    GROUP BY month
    ORDER BY month ASC
  `;

    return result.map(row => ({
        month: row.month,
        meetingCount: Number(row.meetingCount),
        totalSeconds: Number(row.totalSeconds)
    }));
}

export async function getCityLeaderboard(): Promise<CityLeaderboardItem[]> {
    const result = await prisma.$queryRaw<Array<{
        cityId: string;
        cityName: string;
        totalSeconds: number;
        meetingCount: number;
    }>>`
    SELECT
      c.id as "cityId",
      c.name as "cityName",
      CAST(COUNT(DISTINCT cm.id) AS INTEGER) as "meetingCount",
      CAST(COALESCE(SUM(ss."endTimestamp" - ss."startTimestamp"), 0) AS FLOAT) as "totalSeconds"
    FROM "City" c
    JOIN "CouncilMeeting" cm ON cm."cityId" = c.id AND cm.released = true
    LEFT JOIN "SpeakerSegment" ss ON ss."cityId" = c.id AND ss."meetingId" = cm.id
    LEFT JOIN "Summary" s ON s."speakerSegmentId" = ss.id
    WHERE (s.type IS NULL OR s.type != 'procedural')
    GROUP BY c.id, c.name
    ORDER BY "totalSeconds" DESC
  `;

    return result.map(row => ({
        cityId: row.cityId,
        cityName: row.cityName,
        totalSeconds: Number(row.totalSeconds),
        meetingCount: Number(row.meetingCount)
    }));
}
