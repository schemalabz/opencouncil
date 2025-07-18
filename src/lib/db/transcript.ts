import { SpeakerSegment, Utterance, Word, SpeakerTag, Summary, TopicLabel, Topic } from "@prisma/client";
import prisma from "./prisma";
import { joinTranscriptSegments } from "../utils";

export type Transcript = (SpeakerSegment & {
  utterances: Utterance[];
  speakerTag: SpeakerTag;
  topicLabels: (TopicLabel & {
    topic: Topic;
  })[];
  summary: Summary | null;
})[];

// When we put the text at the speaker segment level, we get a transcript that's much smaller in size.
export type LightTranscript = (SpeakerSegment & {
  text: string;
  speakerTag: SpeakerTag;
  topicLabels: (TopicLabel & {
    topic: Topic;
  })[];
  summary: Summary | null;
})[];

export async function getLightTranscript(meetingId: string, cityId: string): Promise<LightTranscript> {
  const speakerSegments = await getTranscript(meetingId, cityId);
  return speakerSegments.map(segment => ({
    ...segment,
    utterances: null, // this cuts down the size massively
    text: segment.utterances.map(u => u.text).join(' '),
    summary: segment.summary,
    speakerTag: segment.speakerTag
  }));
}

export async function getTranscript(meetingId: string, cityId: string, {
  joinAdjacentSameSpeakerSegments = false,
}: {
  joinAdjacentSameSpeakerSegments?: boolean;
} = {}): Promise<Transcript> {

  const speakerSegments = await prisma.speakerSegment.findMany({
    where: {
      meetingId,
      cityId
    },
    include: {
      speakerTag: true,
      utterances: true,
      topicLabels: {
        include: {
          topic: true
        }
      },
      summary: true
    }
  });

  if (joinAdjacentSameSpeakerSegments) {
    return joinTranscriptSegments(speakerSegments);
  }

  return speakerSegments;

  /*
  const startTime = performance.now();
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
        CASE WHEN sum.text IS NOT NULL THEN
          jsonb_build_object('text', sum.text)
        ELSE NULL END AS summary,
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
  return speakerSegments;
    */

}