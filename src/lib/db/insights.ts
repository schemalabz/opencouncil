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
    totalSecondsRaw,
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

    // Transcribed hours: use LATERAL join to match SQL null-summary inclusion logic
    prisma.$queryRaw<[{ totalSeconds: number }]>`
          SELECT CAST(COALESCE(SUM(CASE WHEN (s.type IS NULL OR s.type != 'procedural') THEN ss."endTimestamp" - ss."startTimestamp" ELSE 0 END), 0) AS FLOAT) as "totalSeconds"
          FROM "SpeakerSegment" ss
          JOIN "CouncilMeeting" cm ON ss."meetingId" = cm.id AND cm.released = true
          LEFT JOIN LATERAL (SELECT s.type FROM "Summary" s WHERE s."speakerSegmentId" = ss.id LIMIT 1) s ON true
        `.then(r => r[0].totalSeconds),

    // Total words in substantive segments of released meetings
    prisma.$queryRaw<[{ wordCount: bigint }]>`
          SELECT COUNT(w.id) as "wordCount"
          FROM "Word" w
          JOIN "Utterance" u ON w."utteranceId" = u.id
          JOIN "SpeakerSegment" ss ON u."speakerSegmentId" = ss.id
          JOIN "CouncilMeeting" cm ON ss."meetingId" = cm.id AND cm.released = true
          LEFT JOIN LATERAL (SELECT s.type FROM "Summary" s WHERE s."speakerSegmentId" = ss.id LIMIT 1) s ON true
          WHERE (s.type IS NULL OR s.type != 'procedural')
        `.then(r => Number(r[0].wordCount)),

    // Total unique speakers via COUNT(DISTINCT) to avoid loading all rows into memory
    prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(DISTINCT st."personId") AS count
          FROM "SpeakerTag" st
          WHERE st."personId" IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM "SpeakerSegment" ss
              JOIN "CouncilMeeting" cm ON cm.id = ss."meetingId" AND cm.released = true
              LEFT JOIN LATERAL (SELECT s.type FROM "Summary" s WHERE s."speakerSegmentId" = ss.id LIMIT 1) s ON true
              WHERE ss."speakerTagId" = st.id
                AND (s.type IS NULL OR s.type != 'procedural')
            )
        `.then(r => Number(r[0].count))
  ]);

  const hoursTranscribed = Math.round(Number(totalSecondsRaw) / 3600);

  return {
    cityCount,
    meetingCount,
    hoursTranscribed,
    wordCount,
    speakerCount: speakersAgg,
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
    LEFT JOIN LATERAL (SELECT s.type FROM "Summary" s WHERE s."speakerSegmentId" = ss.id LIMIT 1) s ON true
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
    JOIN LATERAL (
      SELECT r."partyId" FROM "Role" r
      WHERE r."personId" = st."personId" AND r."cityId" = ss."cityId" AND r."partyId" IS NOT NULL
      ORDER BY COALESCE(r."startDate", '1970-01-01'::timestamp) DESC, r."createdAt" DESC
      LIMIT 1
    ) r ON true
    JOIN "Party" p ON r."partyId" = p.id
    LEFT JOIN LATERAL (SELECT s.type FROM "Summary" s WHERE s."speakerSegmentId" = ss.id LIMIT 1) s ON true
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
      CAST(COALESCE(SUM(CASE WHEN (s.type IS NULL OR s.type != 'procedural') THEN ss."endTimestamp" - ss."startTimestamp" ELSE 0 END), 0) AS FLOAT) as "totalSeconds"
    FROM "CouncilMeeting" cm
    LEFT JOIN "SpeakerSegment" ss ON ss."meetingId" = cm.id AND ss."cityId" = cm."cityId"
    LEFT JOIN LATERAL (SELECT s.type FROM "Summary" s WHERE s."speakerSegmentId" = ss.id LIMIT 1) s ON true
    WHERE cm.released = true
      AND cm."dateTime" >= NOW() - INTERVAL '24 months'
    GROUP BY to_char(cm."dateTime", 'YYYY-MM')
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
      CAST(COALESCE(SUM(CASE WHEN (s.type IS NULL OR s.type != 'procedural') THEN ss."endTimestamp" - ss."startTimestamp" ELSE 0 END), 0) AS FLOAT) as "totalSeconds"
    FROM "City" c
    JOIN "CouncilMeeting" cm ON cm."cityId" = c.id AND cm.released = true
    LEFT JOIN "SpeakerSegment" ss ON ss."cityId" = c.id AND ss."meetingId" = cm.id
    LEFT JOIN LATERAL (SELECT s.type FROM "Summary" s WHERE s."speakerSegmentId" = ss.id LIMIT 1) s ON true
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
