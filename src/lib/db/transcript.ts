import { SpeakerSegment, Utterance, Word, SpeakerTag, Summary, TopicLabel, Topic } from "@prisma/client";
import prisma from "./prisma";

export type Transcript = (SpeakerSegment & {
    utterances: (Utterance & {
        words: Word[];
    })[];
    speakerTag: SpeakerTag;
    topicLabels: (TopicLabel & {
        topic: Topic;
    })[];
    summary: Summary | null;
})[];

export async function getTranscript(meetingId: string, cityId: string, {
    joinAdjacentSameSpeakerSegments = true,
}: {
    joinAdjacentSameSpeakerSegments?: boolean;
} = {}): Promise<Transcript> {
    const startTime = performance.now();
    console.log(`Getting transcript for meeting ${meetingId} ${cityId}`);

    const speakerSegments: Transcript = await prisma.$queryRaw`
      WITH speaker_segments AS (
        SELECT 
          ss.id, 
          ss."startTimestamp", 
          ss."endTimestamp", 
          ss."createdAt", 
          ss."updatedAt", 
          ss."meetingId", 
          ss."cityId", 
          ss."speakerTagId",
          st.id AS "speakerTag_id", 
          st.label AS "speakerTag_label", 
          st."personId" AS "speakerTag_personId"
        FROM "SpeakerSegment" ss
        LEFT JOIN "SpeakerTag" st ON ss."speakerTagId" = st.id
        WHERE ss."meetingId" = ${meetingId} AND ss."cityId" = ${cityId}
      )
      SELECT 
        ss.*,
        jsonb_build_object(
          'id', ss."speakerTag_id",
          'label', ss."speakerTag_label",
          'personId', ss."speakerTag_personId"
        ) AS "speakerTag",
        u.utterances,
        sum.text AS "summary.text",
        COALESCE(tl.topic_labels, '[]'::jsonb) AS "topicLabels"
      FROM speaker_segments ss
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', u.id,
            'startTimestamp', u."startTimestamp",
            'endTimestamp', u."endTimestamp",
            'text', u.text,
            'drift', u.drift,
            'words', (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', w.id,
                  'text', w.text,
                  'startTimestamp', w."startTimestamp",
                  'endTimestamp', w."endTimestamp",
                  'confidence', w.confidence
                ) ORDER BY w."startTimestamp" ASC
              )
              FROM "Word" w
              WHERE w."utteranceId" = u.id
            )
          ) ORDER BY u."startTimestamp" ASC
        ) AS utterances
        FROM "Utterance" u
        WHERE u."speakerSegmentId" = ss.id
      ) u ON true
      LEFT JOIN "Summary" sum ON ss.id = sum."speakerSegmentId"
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', tl.id,
            'topic', jsonb_build_object(
              'id', t.id,
              'name', t.name,
              'name_en', t.name_en,
              'colorHex', t."colorHex"
            )
          )
        ) AS topic_labels
        FROM "TopicLabel" tl
        JOIN "Topic" t ON tl."topicId" = t.id
        WHERE tl."speakerSegmentId" = ss.id
      ) tl ON true
      ORDER BY ss."startTimestamp" ASC
    `;

    const endTime = performance.now();
    console.log(`Time taken to query for transcript: ${endTime - startTime} milliseconds`);

    console.log(`Topic labels: ${speakerSegments.reduce((acc, segment) => {
        return acc + segment.topicLabels.length;
    }, 0)}`);

    if (joinAdjacentSameSpeakerSegments) {
        return joinTranscriptSegments(speakerSegments);
    } else {
        return speakerSegments;
    }
}

export function joinTranscriptSegments(speakerSegments: Transcript): Transcript {
    if (speakerSegments.length === 0) {
        return speakerSegments;
    }

    const joinedSegments = [];
    let currentSegment = speakerSegments[0];

    for (let i = 1; i < speakerSegments.length; i++) {
        if (speakerSegments[i].speakerTag.personId && currentSegment.speakerTag.personId
            && speakerSegments[i].speakerTag.personId === currentSegment.speakerTag.personId) {
            // Join adjacent segments with the same speaker
            currentSegment.endTimestamp = speakerSegments[i].endTimestamp;
            currentSegment.utterances = [...currentSegment.utterances, ...speakerSegments[i].utterances];
            currentSegment.topicLabels = [...currentSegment.topicLabels, ...speakerSegments[i].topicLabels];
        } else {
            // Push the current segment and start a new one
            joinedSegments.push(currentSegment);
            currentSegment = speakerSegments[i];
        }
    }

    // Push the last segment
    joinedSegments.push(currentSegment);

    return joinedSegments;
}

export async function updateEmbeddings(embeddings: { speakerSegmentId: SpeakerSegment["id"], embedding: number[] }[]) {
    await prisma.$transaction(
        embeddings.map(e =>
            prisma.$executeRaw`
                UPDATE "SpeakerSegment"
                SET embedding = ${e.embedding}::vector
                WHERE id = ${e.speakerSegmentId}
            `
        )
    );
}