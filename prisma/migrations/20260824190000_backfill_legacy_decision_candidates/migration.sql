-- Every legacy Decision with an ADA becomes an assigned candidate row
-- (issue #617 phase 4). Two things depend on this substrate:
-- unlinking a decision stays reversible (onDelete: SetNull returns the
-- candidate to the meeting's unplaced list), and the knownDecisions
-- handshake can schedule the document for reading — readStatus 'unread'
-- keeps the row eligible, because the backfill records that the link
-- exists, never that it is correct: production links contain known errors.
-- The reading fields stay null until a poll reads the document; there was
-- no recorded suggestion, so subjectId stays null too.
INSERT INTO "DecisionCandidate" ("id", "cityId", "ada", "pdfUrl", "title", "publishDate", "protocolNumber", "readStatus", "councilMeetingId", "decisionId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), s."cityId", d.ada, d."pdfUrl", d.title, d."publishDate", d."protocolNumber",
       'unread', s."councilMeetingId", d.id, NOW(), NOW()
FROM "Decision" d
JOIN "Subject" s ON s.id = d."subjectId"
WHERE d.ada IS NOT NULL
-- An ADA already occupied by a claim-derived or poll-created candidate keeps
-- its existing row. Accepted edge: a decision whose ADA is held by another
-- subject's claim gets no backing candidate, so unlinking it stays
-- destructive — the admin UI warns on rows without one, the same branch as
-- the ADA-null decisions this migration deliberately skips.
ON CONFLICT ("cityId", "ada") DO NOTHING;
