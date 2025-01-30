WITH RankedEdits AS (
    SELECT 
        "UtteranceEdit"."utteranceId",
        "UtteranceEdit"."beforeText",
        "UtteranceEdit"."afterText",
        ROW_NUMBER() OVER (
            PARTITION BY "UtteranceEdit"."utteranceId" 
            ORDER BY "UtteranceEdit"."createdAt" ASC
        ) AS first_rank,
        ROW_NUMBER() OVER (
            PARTITION BY "UtteranceEdit"."utteranceId" 
            ORDER BY "UtteranceEdit"."createdAt" DESC
        ) AS last_rank
    FROM "UtteranceEdit"
),
EditPairs AS (
    SELECT 
        "utteranceId",
        MIN(CASE WHEN first_rank = 1 THEN "beforeText" END) AS initial_text,
        MAX(CASE WHEN last_rank = 1 THEN "afterText" END) AS final_text
    FROM RankedEdits
    GROUP BY "utteranceId"
),
UtteranceContext AS (
    SELECT 
        u."id" AS current_utterance_id,
        STRING_AGG(
            CASE 
                WHEN u2."id" = u."id" THEN COALESCE(e.final_text, u2."text")
                ELSE u2."text" 
            END,
            ' | ' 
            ORDER BY TO_TIMESTAMP(u2."startTimestamp")
        ) AS context
    FROM "Utterance" u
    CROSS JOIN LATERAL (
        SELECT *
        FROM "Utterance" u2
        WHERE u2."speakerSegmentId" = u."speakerSegmentId"
          AND TO_TIMESTAMP(u2."startTimestamp") 
              BETWEEN TO_TIMESTAMP(u."startTimestamp") - INTERVAL '1 minute'
                  AND TO_TIMESTAMP(u."startTimestamp") + INTERVAL '1 minute'
        ORDER BY ABS(
            EXTRACT(EPOCH FROM (TO_TIMESTAMP(u2."startTimestamp") - TO_TIMESTAMP(u."startTimestamp")))
        )
        LIMIT 11
    ) u2
    LEFT JOIN EditPairs e 
        ON u."id" = e."utteranceId"
    GROUP BY u."id"
)
SELECT 
    e."utteranceId",
    e.initial_text AS beforeText,
    e.final_text AS afterText,
    uc.context
FROM EditPairs e
JOIN UtteranceContext uc 
    ON e."utteranceId" = uc.current_utterance_id
WHERE e.initial_text IS NOT NULL 
  AND e.final_text IS NOT NULL;
