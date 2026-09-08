-- Known gap: this file does not follow the "taskId" edge.
-- Decision, SubjectVote, SubjectAttendance, MeetingAttendance, and
-- AttendanceEvent all reference TaskStatus. TaskStatus rows are themselves
-- subset-derived.
-- A task can belong to a meeting outside the subset. Greenmask can then
-- drop the row that holds the reference, but this file still counts it.
-- The invariant query of `measure-tasks` measures this edge.
-- Do not change the counts here to compensate.
WITH mtg AS (SELECT c, m FROM sel),
     subj AS (SELECT s.id, s."locationId" FROM "Subject" s JOIN mtg ON (mtg.c, mtg.m) = (s."cityId", s."councilMeetingId")),
     seg AS (SELECT s.id, s."speakerTagId" FROM "SpeakerSegment" s JOIN mtg ON (mtg.c, mtg.m) = (s."cityId", s."meetingId")),
     utt AS (SELECT u.id FROM "Utterance" u JOIN seg ON seg.id = u."speakerSegmentId"),
     hl AS (SELECT h.id FROM "Highlight" h JOIN mtg ON (mtg.c, mtg.m) = (h."cityId", h."meetingId")),
     dec AS (SELECT d.id FROM "Decision" d JOIN subj ON subj.id = d."subjectId"),
     supported AS (SELECT id FROM "City" WHERE status = 'supported')
SELECT t AS "table", n::text AS n FROM (VALUES
  ('City', (SELECT count(*) FROM "City")),
  ('Topic', (SELECT count(*) FROM "Topic")),
  ('AdministrativeBody', (SELECT count(*) FROM "AdministrativeBody")),
  ('Party', (SELECT count(*) FROM "Party")),
  ('Person', (SELECT count(*) FROM "Person")),
  ('Role', (SELECT count(*) FROM "Role")),
  ('CouncilMeeting', (SELECT count(*) FROM mtg)),
  ('Subject', (SELECT count(*) FROM subj)),
  ('Location', (SELECT count(DISTINCT "locationId") FROM subj WHERE "locationId" IS NOT NULL)),
  ('SpeakerSegment', (SELECT count(*) FROM seg)),
  ('SpeakerTag', (SELECT count(DISTINCT "speakerTagId") FROM seg)),
  ('SpeakerIdentification', (SELECT count(*) FROM "SpeakerIdentification" si WHERE si."speakerTagId" IN (SELECT "speakerTagId" FROM seg))),
  ('Utterance', (SELECT count(*) FROM utt)),
  ('Word', (SELECT count(*) FROM "Word" w JOIN utt ON utt.id = w."utteranceId")),
  ('Summary', (SELECT count(*) FROM "Summary" s JOIN seg ON seg.id = s."speakerSegmentId")),
  ('TopicLabel', (SELECT count(*) FROM "TopicLabel" tl JOIN seg ON seg.id = tl."speakerSegmentId")),
  ('Highlight', (SELECT count(*) FROM hl)),
  ('HighlightedUtterance', (SELECT count(*) FROM "HighlightedUtterance" hu JOIN hl ON hl.id = hu."highlightId" JOIN utt ON utt.id = hu."utteranceId")),
  ('Decision', (SELECT count(*) FROM dec)),
  ('DecisionCandidate', (SELECT count(*) FROM "DecisionCandidate" dc
      WHERE dc."cityId" IN (SELECT id FROM supported)
        AND (dc."councilMeetingId" IS NULL OR EXISTS (SELECT 1 FROM mtg WHERE (mtg.c, mtg.m) = (dc."cityId", dc."councilMeetingId")))
        AND (dc."decisionId" IS NULL OR dc."decisionId" IN (SELECT id FROM dec))
        AND (dc."subjectId" IS NULL OR dc."subjectId" IN (SELECT id FROM subj)))),
  ('SpeakerContribution', (SELECT count(*) FROM "SpeakerContribution" sc JOIN subj ON subj.id = sc."subjectId")),
  ('SubjectAttendance', (SELECT count(*) FROM "SubjectAttendance" sa JOIN subj ON subj.id = sa."subjectId")),
  ('SubjectVote', (SELECT count(*) FROM "SubjectVote" sv JOIN subj ON subj.id = sv."subjectId")),
  ('MeetingAttendance', (SELECT count(*) FROM "MeetingAttendance" ma JOIN mtg ON (mtg.c, mtg.m) = (ma."cityId", ma."councilMeetingId"))),
  ('AttendanceEvent', (SELECT count(*) FROM "AttendanceEvent" a JOIN mtg ON (mtg.c, mtg.m) = (a."cityId", a."councilMeetingId"))),
  ('TaskStatus', (SELECT count(*) FROM "TaskStatus" ts JOIN mtg ON (mtg.c, mtg.m) = (ts."cityId", ts."councilMeetingId"))),
  ('CityMessage', (SELECT count(*) FROM "CityMessage")),
  ('Consultation', (SELECT count(*) FROM "Consultation"))
) v(t, n);
