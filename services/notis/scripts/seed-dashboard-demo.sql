-- Demo rows for the admin dashboard's empty states (DEV ONLY).
-- Apply:   psql "$NOTIS_DATABASE_URL" -v sub=<subscriptionId> -v sub2=<otherSubscriptionId> -f scripts/seed-dashboard-demo.sql
-- (two DIFFERENT subscriptions: the partial unique index allows only one
--  pending batch row per subscription — the demo shows two)
-- Remove:  psql "$NOTIS_DATABASE_URL" -f scripts/seed-dashboard-demo-cleanup.sql
--
-- Every id is prefixed fake- so cleanup is a prefix delete. The one
-- running queue row carries attempts=3 on purpose: when its claim goes
-- stale (15'), the reclaim exceeds MAX_ATTEMPTS and it fails terminally —
-- the model never runs for demo data.

-- 1. Digested meetings: two with rich briefs, one consumed without one.
INSERT INTO "NotisProcessedEvent" ("taskId", type, "cityId", "meetingId", "meetingName", "meetingDate", "adminBodyName", brief, "briefCostUsd", "processedAt") VALUES
('fake-task-1', 'summarize', 'athens', 'fake-jul29', '18η Τακτική Συνεδρίαση', '2026-08-17T18:00:00Z', 'Δημοτικό Συμβούλιο', $$
{"cityId":"athens","meetingId":"fake-jul29","generatedAt":"2026-08-18T09:00:00.000Z",
 "headline":"Μετρό Γραμμή 4: ο Δήμος πληρώνει πραγματογνώμονες για τις ρωγμές στην Κυψέλη",
 "subjects":[
  {"subjectId":"fake-s1","name":"Ζημιές πολυκατοικιών Κυψέλης από τη σήραγγα της Γραμμής 4","topicLabels":["Πολεοδομία"],"discussionSeconds":2520,
   "scores":{"hyperlocal":5,"citywide":3,"contention":4,"novelty":4,"money":4},
   "note":"Ομόφωνη απόφαση: ο Δήμος καλύπτει ανεξάρτητους πραγματογνώμονες και νομικό σύμβουλο των κατοίκων.","locationHints":["Κυψέλη"]},
  {"subjectId":"fake-s2","name":"Ανάπλαση πλατείας Αγίου Γεωργίου","topicLabels":["Δημόσιος χώρος"],"discussionSeconds":1140,
   "scores":{"hyperlocal":4,"citywide":2,"contention":1,"novelty":3,"money":3},
   "note":"2,3 εκατ. από το πράσινο ταμείο· έργα από Σεπτέμβριο.","locationHints":["Κυψέλη"]},
  {"subjectId":"fake-s3","name":"Έγκριση απολογισμού ΟΠΑΝΔΑ","topicLabels":["Προϋπολογισμός & Οικονομία"],"discussionSeconds":600,
   "scores":{"hyperlocal":0,"citywide":2,"contention":1,"novelty":1,"money":2},
   "note":"Τυπική έγκριση, χωρίς ουσιαστική αντιπαράθεση.","locationHints":[]},
  {"subjectId":"fake-s4","name":"Κυκλοφοριακές ρυθμίσεις Πανόρμου","topicLabels":["Συγκοινωνίες"],"discussionSeconds":840,
   "scores":{"hyperlocal":3,"citywide":1,"contention":2,"novelty":2,"money":1},
   "note":"Πιλοτική πεζοδρόμηση σαββατοκύριακων για έξι μήνες.","locationHints":["Πανόρμου"]}
 ]}$$::jsonb, 0.11, now() - interval '3 hours'),
('fake-task-2', 'processAgenda', 'athens', 'fake-sep02', '19η Τακτική Συνεδρίαση', '2026-09-02T17:00:00Z', 'Δημοτικό Συμβούλιο', $$
{"cityId":"athens","meetingId":"fake-sep02","generatedAt":"2026-08-18T10:00:00.000Z",
 "headline":"Πριν τη συνεδρίαση της Τετάρτης: προϋπολογισμός ύδρευσης και δύο απαλλοτριώσεις",
 "subjects":[
  {"subjectId":"fake-s5","name":"Αναμόρφωση προϋπολογισμού ύδρευσης","topicLabels":["Προϋπολογισμός & Οικονομία"],"discussionSeconds":0,
   "scores":{"hyperlocal":1,"citywide":4,"contention":3,"novelty":3,"money":5},
   "note":"4,1 εκατ. μεταφορά· αναμένεται ένσταση της μειοψηφίας.","locationHints":[]},
  {"subjectId":"fake-s6","name":"Απαλλοτρίωση οικοπέδων για σχολείο στου Γκύζη","topicLabels":["Παιδεία"],"discussionSeconds":0,
   "scores":{"hyperlocal":5,"citywide":2,"contention":2,"novelty":4,"money":3},
   "note":"Πρώτη συζήτηση· αφορά δύο οικοδομικά τετράγωνα.","locationHints":["Γκύζη"]},
  {"subjectId":"fake-s7","name":"Κανονισμός τραπεζοκαθισμάτων","topicLabels":["Δημόσιος χώρος"],"discussionSeconds":0,
   "scores":{"hyperlocal":2,"citywide":3,"contention":3,"novelty":1,"money":2},
   "note":"Επιστρέφει μετά την αναβολή του Ιουνίου.","locationHints":[]}
 ]}$$::jsonb, 0.06, now() - interval '80 minutes'),
('fake-task-3', 'summarize', 'chania', 'fake-aug11', 'Συνεδρίαση Επιτροπής', '2026-08-11T17:00:00Z', 'Δημοτική Επιτροπή', NULL, NULL, now() - interval '26 hours')
ON CONFLICT ("taskId") DO NOTHING;

-- 2. Queue rows: one held for the morning release, one due soon (multi-
--    event), one running, one failed with its error.
INSERT INTO "NotisWakeQueue" (id, "subscriptionId", lane, events, "runAfter", status, "claimedAt", attempts, "lastError", "createdAt", "updatedAt") VALUES
('fake-q-held', :'sub', 'batch',
 $$[{"type":"meeting_summarized","at":"2026-08-18T20:15:00.000Z","cityId":"athens","meetingId":"fake-jul29","meetingName":"Δημοτικό Συμβούλιο","meetingDate":"2026-08-17T18:00:00.000Z","brief":{"cityId":"athens","meetingId":"fake-jul29","generatedAt":"2026-08-18T20:15:00.000Z","headline":"demo","subjects":[]}}]$$::jsonb,
 date_trunc('day', now() AT TIME ZONE 'Europe/Athens')::timestamp AT TIME ZONE 'Europe/Athens' + interval '1 day 9 hours 7 minutes',
 'pending', NULL, 0, NULL, now() - interval '40 minutes', now()),
('fake-q-soon', :'sub2', 'batch',
 $$[{"type":"agenda_processed","at":"2026-08-18T16:00:00.000Z","cityId":"athens","meetingId":"fake-sep02","meetingName":"Δημοτικό Συμβούλιο","meetingDate":"2026-09-02T17:00:00.000Z","brief":{"cityId":"athens","meetingId":"fake-sep02","generatedAt":"2026-08-18T16:00:00.000Z","headline":"demo","subjects":[]}},{"type":"scheduled","at":"2026-08-18T16:05:00.000Z","reason":"έλεγχος απόφασης","origin":"proactive"}]$$::jsonb,
 now() + interval '24 minutes', 'pending', NULL, 0, NULL, now() - interval '10 minutes', now()),
('fake-q-running', :'sub', 'live',
 $$[{"type":"user_message","at":"2026-08-18T17:40:00.000Z","text":"Τι έγινε με τα τραπεζοκαθίσματα;"}]$$::jsonb,
 now() - interval '1 minute', 'running', now() - interval '35 seconds', 3, NULL, now() - interval '2 minutes', now()),
('fake-q-failed', :'sub', 'batch',
 $$[{"type":"meeting_summarized","at":"2026-08-17T12:00:00.000Z","cityId":"athens","meetingId":"fake-jul22","meetingName":"Δημοτική Επιτροπή","meetingDate":"2026-07-22T17:00:00.000Z","brief":{"cityId":"athens","meetingId":"fake-jul22","generatedAt":"2026-08-17T12:00:00.000Z","headline":"demo","subjects":[]}}]$$::jsonb,
 now() - interval '3 hours', 'failed', now() - interval '3 hours', 4,
 'gave up after 3 attempts: MCP fetch timed out (get_meeting athens/fake-jul22)', now() - interval '4 hours', now())
ON CONFLICT (id) DO NOTHING;

-- 3. Three delivered unprompted sends inside the rolling week put the
--    subscription at the weekly cap; a fourth shows a cap suppression.
INSERT INTO "NotisMessage" (id, "subscriptionId", direction, body, channel, proactive, "deliveryMode", template, status, "failureReason", "createdAt") VALUES
('fake-msg-1', :'sub', 'outbound', 'Η πλατεία Αγίου Γεωργίου παίρνει 2,3 εκατ. για ανάπλαση — τα έργα ξεκινούν τον Σεπτέμβριο.', 'whatsapp', true, 'template', 'demos_update_news', 'delivered', NULL, now() - interval '2 days'),
('fake-msg-2', :'sub', 'outbound', 'Πριν την επόμενη συνεδρίαση: απαλλοτρίωση για νέο σχολείο στου Γκύζη, πρώτη συζήτηση.', 'whatsapp', true, 'template', 'demos_update_agenda', 'read', NULL, now() - interval '1 day'),
('fake-msg-3', :'sub', 'outbound', 'Ο Δήμος καλύπτει πραγματογνώμονες για τις ρωγμές στην Κυψέλη — πέρασε ομόφωνα.', 'whatsapp', true, 'template', 'demos_update_news', 'sent', NULL, now() - interval '5 hours'),
('fake-msg-4', :'sub', 'outbound', 'Πιλοτική πεζοδρόμηση της Πανόρμου τα σαββατοκύριακα — ξεκινά τον Οκτώβριο.', 'whatsapp', true, 'template', 'demos_update_news', 'suppressed', 'weekly cap', now() - interval '2 hours')
ON CONFLICT (id) DO NOTHING;

-- 4. Two more future notes for the schedule ledger: a proactive one and a
--    small-hours one that shows the quiet-hours hold.
INSERT INTO "NotisScheduledWake" (id, "subscriptionId", "runAfter", reason, origin, "createdAt") VALUES
('fake-sched-1', :'sub', now() + interval '26 hours', 'Να ξαναδώ αν δημοσιεύτηκε η μελέτη για την Πανόρμου.', 'proactive', now()),
('fake-sched-2', :'sub', date_trunc('day', now() AT TIME ZONE 'Europe/Athens')::timestamp AT TIME ZONE 'Europe/Athens' + interval '1 day 3 hours', 'Υποσχέθηκα απάντηση για τον κανονισμό τραπεζοκαθισμάτων.', 'reply', now())
ON CONFLICT (id) DO NOTHING;
