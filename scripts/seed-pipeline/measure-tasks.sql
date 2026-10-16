-- Size of task rows per type inside the selected meetings.
SELECT t.type,
       count(*) AS rows,
       pg_size_pretty(sum(length(t."responseBody"))::bigint) AS response_total,
       pg_size_pretty(max(length(t."responseBody"))::bigint) AS response_max,
       pg_size_pretty(sum(length(t."requestBody"))::bigint) AS request_total
  FROM "TaskStatus" t JOIN sel ON (sel.c, sel.m) = (t."cityId", t."councilMeetingId")
 GROUP BY t.type
 ORDER BY sum(length(t."responseBody")) DESC NULLS LAST;

-- Keys that appear in requestBody, per type: anything that looks like a secret must get a masking rule.
-- A failed task stores its error text in requestBody, not a JSON object, so pg_input_is_valid
-- skips those rows before the ::jsonb cast runs.
SELECT t.type, k AS request_key, count(*) AS rows
  FROM "TaskStatus" t JOIN sel ON (sel.c, sel.m) = (t."cityId", t."councilMeetingId"),
       jsonb_object_keys(t."requestBody"::jsonb) k
 WHERE pg_input_is_valid(t."requestBody", 'jsonb')
 GROUP BY 1, 2
 ORDER BY 1, 3 DESC;

-- Rows whose requestBody or responseBody is not valid JSON, per type and status: these are the
-- failed-task error-text rows that a jsonb-casting masking rule must skip.
SELECT t.type, t.status, count(*) AS rows
  FROM "TaskStatus" t JOIN sel ON (sel.c, sel.m) = (t."cityId", t."councilMeetingId")
 WHERE NOT pg_input_is_valid(t."requestBody", 'jsonb') OR NOT pg_input_is_valid(t."responseBody", 'jsonb')
 GROUP BY 1, 2
 ORDER BY 1, 2;

-- Invariant: every taskId on a content row of the selected meetings points at a task of the same meeting.
SELECT 'Decision' AS "table", count(*) AS cross_meeting
  FROM "Decision" d JOIN "Subject" s ON s.id = d."subjectId" JOIN sel ON (sel.c, sel.m) = (s."cityId", s."councilMeetingId")
  JOIN "TaskStatus" ts ON ts.id = d."taskId"
 WHERE (ts."cityId", ts."councilMeetingId") <> (s."cityId", s."councilMeetingId")
UNION ALL
SELECT 'SubjectVote', count(*)
  FROM "SubjectVote" v JOIN "Subject" s ON s.id = v."subjectId" JOIN sel ON (sel.c, sel.m) = (s."cityId", s."councilMeetingId")
  JOIN "TaskStatus" ts ON ts.id = v."taskId"
 WHERE (ts."cityId", ts."councilMeetingId") <> (s."cityId", s."councilMeetingId")
UNION ALL
SELECT 'SubjectAttendance', count(*)
  FROM "SubjectAttendance" a JOIN "Subject" s ON s.id = a."subjectId" JOIN sel ON (sel.c, sel.m) = (s."cityId", s."councilMeetingId")
  JOIN "TaskStatus" ts ON ts.id = a."taskId"
 WHERE (ts."cityId", ts."councilMeetingId") <> (s."cityId", s."councilMeetingId")
UNION ALL
SELECT 'MeetingAttendance', count(*)
  FROM "MeetingAttendance" a JOIN sel ON (sel.c, sel.m) = (a."cityId", a."councilMeetingId")
  JOIN "TaskStatus" ts ON ts.id = a."taskId"
 WHERE (ts."cityId", ts."councilMeetingId") <> (a."cityId", a."councilMeetingId")
UNION ALL
SELECT 'AttendanceEvent', count(*)
  FROM "AttendanceEvent" a JOIN sel ON (sel.c, sel.m) = (a."cityId", a."councilMeetingId")
  JOIN "TaskStatus" ts ON ts.id = a."taskId"
 WHERE (ts."cityId", ts."councilMeetingId") <> (a."cityId", a."councilMeetingId");
