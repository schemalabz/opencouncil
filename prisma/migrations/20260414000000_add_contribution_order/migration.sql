-- AlterTable
ALTER TABLE "SpeakerContribution" ADD COLUMN "order" INTEGER;

-- Backfill order for all existing contributions
-- Priority: introducer first, unlabeled speakers next (by createdAt), identified speakers last (by first utterance time)
WITH first_utterances AS (
    SELECT
        u."discussionSubjectId" AS subject_id,
        st."personId" AS person_id,
        MIN(u."startTimestamp") AS first_ts
    FROM "Utterance" u
    JOIN "SpeakerSegment" ss ON u."speakerSegmentId" = ss.id
    JOIN "SpeakerTag" st ON ss."speakerTagId" = st.id
    WHERE u."discussionSubjectId" IS NOT NULL
      AND u."discussionStatus" = 'SUBJECT_DISCUSSION'
      AND st."personId" IS NOT NULL
    GROUP BY u."discussionSubjectId", st."personId"
),
ranked AS (
    SELECT
        sc.id AS contribution_id,
        ROW_NUMBER() OVER (
            PARTITION BY sc."subjectId"
            ORDER BY
                -- Introducer first
                CASE WHEN sc."speakerId" IS NOT NULL
                      AND sc."speakerId" = s."personId"
                     THEN 0 ELSE 1 END,
                -- Unlabeled speakers (no speakerId) second
                CASE WHEN sc."speakerId" IS NULL THEN 0 ELSE 1 END,
                -- Identified speakers by first utterance timestamp
                COALESCE(fu.first_ts, 'Infinity'::float8),
                -- Final tiebreaker
                sc."createdAt"
        ) - 1 AS computed_order
    FROM "SpeakerContribution" sc
    JOIN "Subject" s ON sc."subjectId" = s.id
    LEFT JOIN first_utterances fu
        ON fu.subject_id = sc."subjectId"
       AND fu.person_id = sc."speakerId"
)
UPDATE "SpeakerContribution"
SET "order" = ranked.computed_order
FROM ranked
WHERE "SpeakerContribution".id = ranked.contribution_id;
