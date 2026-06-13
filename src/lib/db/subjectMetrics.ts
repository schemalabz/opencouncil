import prisma from './prisma';

export interface SubjectMetrics {
    discussionSeconds: number;
    speakerCount: number;
}

interface MetricsRow {
    subjectId: string;
    seconds: number | null;
    speakers: bigint;
}

/**
 * Per-subject discussion length + unique speaker count, aggregated in SQL —
 * one row per subject instead of pulling every utterance/segment into the app
 * (which was ~245k rows and 6s of the map query). These numbers are static
 * once a meeting is processed, so the result is filter-independent and cached
 * under a single key (getSubjectMetricsCached).
 *
 * Precedence matches the old per-subject logic: the new system
 * (Utterance.discussionSubjectId) wins; subjects with none fall back to the
 * legacy SubjectSpeakerSegment links.
 */
export async function getSubjectMetrics(): Promise<Record<string, SubjectMetrics>> {
    const metrics: Record<string, SubjectMetrics> = {};

    const newSystem = await prisma.$queryRaw<MetricsRow[]>`
        SELECT u."discussionSubjectId" AS "subjectId",
               SUM(u."endTimestamp" - u."startTimestamp")::float8 AS seconds,
               COUNT(DISTINCT ss."speakerTagId") AS speakers
        FROM "Utterance" u
        JOIN "SpeakerSegment" ss ON ss.id = u."speakerSegmentId"
        WHERE u."discussionStatus" = 'SUBJECT_DISCUSSION'
          AND u."discussionSubjectId" IS NOT NULL
        GROUP BY u."discussionSubjectId"
    `;
    for (const row of newSystem) {
        metrics[row.subjectId] = {
            discussionSeconds: Math.round(Number(row.seconds ?? 0)),
            speakerCount: Number(row.speakers),
        };
    }

    const legacySystem = await prisma.$queryRaw<MetricsRow[]>`
        SELECT sss."subjectId" AS "subjectId",
               SUM(ss."endTimestamp" - ss."startTimestamp")::float8 AS seconds,
               COUNT(DISTINCT ss."speakerTagId") AS speakers
        FROM "SubjectSpeakerSegment" sss
        JOIN "SpeakerSegment" ss ON ss.id = sss."speakerSegmentId"
        GROUP BY sss."subjectId"
    `;
    for (const row of legacySystem) {
        if (!(row.subjectId in metrics)) {
            metrics[row.subjectId] = {
                discussionSeconds: Math.round(Number(row.seconds ?? 0)),
                speakerCount: Number(row.speakers),
            };
        }
    }

    return metrics;
}
