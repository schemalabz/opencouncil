-- Demo rows for the admin dashboard's empty states (DEV ONLY).
-- Apply:   psql "$NOTIS_DATABASE_URL" -f scripts/seed-dashboard-demo.sql
-- Remove:  psql "$NOTIS_DATABASE_URL" -f scripts/seed-dashboard-demo-cleanup.sql
--
-- Every id is prefixed fake- so cleanup is a prefix delete.
--
-- The demo is INERT BY CONSTRUCTION — it is a live queue, not a mockup, so
-- nothing here may reach the drainer:
--  * its two subscriptions are its own (never a real reader's), and both are
--    `unsubscribed` with no phone, so every rail suppresses a send and no
--    cold send has anywhere to go;
--  * every queue row carries attempts above MAX_ATTEMPTS, so a claim fails
--    it terminally BEFORE the model runs — no Anthropic spend, no message.
-- Keeping the rows claimable-looking is the point: the dashboard shows real
-- countdowns and real lane badges, and only the drainer knows the
-- difference. Two subscriptions because the partial unique index allows one
-- pending batch row each.
--
-- The janitor may purge these subscriptions (their userIds do not exist in
-- notis_users) or alarm on its blast-radius guard. Both are harmless on a
-- dev database; re-seed if the demo disappears.

-- 0. The demo's own subscriptions.
INSERT INTO "NotisSubscription" (id, "userId", phone, status, origin, "profileText", "userName", "unsubscribedAt", "createdAt", "updatedAt") VALUES
('fake-sub-1', 'fake-user-1', NULL, 'unsubscribed', 'transition', 'Δείγμα προφίλ: μένει στην Κυψέλη, παρακολουθεί πολεοδομικά και τον Δήμο Αθηναίων.', 'Δείγμα Α (demo)', now() - interval '6 hours', now() - interval '9 days', now() - interval '2 hours'),
('fake-sub-2', 'fake-user-2', NULL, 'unsubscribed', 'inbound', 'Δείγμα προφίλ: ρωτάει κυρίως για συγκοινωνίες στα Χανιά.', 'Δείγμα Β (demo)', now() - interval '6 hours', now() - interval '4 days', now() - interval '3 hours')
ON CONFLICT (id) DO NOTHING;

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

-- 2. Queue rows: one held for the morning release, one due later today
--    (multi-event), one running, one failed with its error. attempts=4 keeps
--    every one of them past MAX_ATTEMPTS — see the inertness note above.
--    Their runAfter values sit hours out so a working session sees live
--    countdowns; a row that does come due is failed terminally by the
--    drainer (no model, no send), so re-seed to refresh the demo.
INSERT INTO "NotisWakeQueue" (id, "subscriptionId", lane, events, "runAfter", status, "claimedAt", attempts, "lastError", "createdAt", "updatedAt") VALUES
('fake-q-held', 'fake-sub-1', 'batch',
 $$[{"type":"meeting_summarized","at":"2026-08-18T20:15:00.000Z","cityId":"athens","meetingId":"fake-jul29","meetingName":"Δημοτικό Συμβούλιο","meetingDate":"2026-08-17T18:00:00.000Z","brief":{"cityId":"athens","meetingId":"fake-jul29","generatedAt":"2026-08-18T20:15:00.000Z","headline":"demo","subjects":[]}}]$$::jsonb,
 date_trunc('day', now() AT TIME ZONE 'Europe/Athens')::timestamp AT TIME ZONE 'Europe/Athens' + interval '1 day 9 hours 7 minutes',
 'pending', NULL, 4, NULL, now() - interval '40 minutes', now()),
('fake-q-soon', 'fake-sub-2', 'batch',
 $$[{"type":"agenda_processed","at":"2026-08-18T16:00:00.000Z","cityId":"athens","meetingId":"fake-sep02","meetingName":"Δημοτικό Συμβούλιο","meetingDate":"2026-09-02T17:00:00.000Z","brief":{"cityId":"athens","meetingId":"fake-sep02","generatedAt":"2026-08-18T16:00:00.000Z","headline":"demo","subjects":[]}},{"type":"scheduled","at":"2026-08-18T16:05:00.000Z","reason":"έλεγχος απόφασης","origin":"proactive"}]$$::jsonb,
 now() + interval '6 hours', 'pending', NULL, 4, NULL, now() - interval '10 minutes', now()),
('fake-q-running', 'fake-sub-1', 'live',
 $$[{"type":"user_message","at":"2026-08-18T17:40:00.000Z","text":"Τι έγινε με τα τραπεζοκαθίσματα;"}]$$::jsonb,
 now() - interval '1 minute', 'running', now() - interval '35 seconds', 4, NULL, now() - interval '2 minutes', now()),
('fake-q-failed', 'fake-sub-1', 'batch',
 $$[{"type":"meeting_summarized","at":"2026-08-17T12:00:00.000Z","cityId":"athens","meetingId":"fake-jul22","meetingName":"Δημοτική Επιτροπή","meetingDate":"2026-07-22T17:00:00.000Z","brief":{"cityId":"athens","meetingId":"fake-jul22","generatedAt":"2026-08-17T12:00:00.000Z","headline":"demo","subjects":[]}}]$$::jsonb,
 now() - interval '3 hours', 'failed', now() - interval '3 hours', 4,
 'gave up after 3 attempts: MCP fetch timed out (get_meeting athens/fake-jul22)', now() - interval '4 hours', now())
ON CONFLICT (id) DO NOTHING;

-- 3. Three delivered unprompted sends inside the rolling week put the
--    subscription at the weekly cap; a fourth shows a cap suppression.
INSERT INTO "NotisMessage" (id, "subscriptionId", direction, body, channel, proactive, "deliveryMode", template, status, "failureReason", "createdAt") VALUES
('fake-msg-1', 'fake-sub-1', 'outbound', 'Η πλατεία Αγίου Γεωργίου παίρνει 2,3 εκατ. για ανάπλαση — τα έργα ξεκινούν τον Σεπτέμβριο.', 'whatsapp', true, 'template', 'demos_update_news', 'delivered', NULL, now() - interval '2 days'),
('fake-msg-2', 'fake-sub-1', 'outbound', 'Πριν την επόμενη συνεδρίαση: απαλλοτρίωση για νέο σχολείο στου Γκύζη, πρώτη συζήτηση.', 'whatsapp', true, 'template', 'demos_update_agenda', 'read', NULL, now() - interval '1 day'),
('fake-msg-3', 'fake-sub-1', 'outbound', 'Ο Δήμος καλύπτει πραγματογνώμονες για τις ρωγμές στην Κυψέλη — πέρασε ομόφωνα.', 'whatsapp', true, 'template', 'demos_update_news', 'sent', NULL, now() - interval '5 hours'),
('fake-msg-4', 'fake-sub-1', 'outbound', 'Πιλοτική πεζοδρόμηση της Πανόρμου τα σαββατοκύριακα — ξεκινά τον Οκτώβριο.', 'whatsapp', true, 'template', 'demos_update_news', 'suppressed', 'weekly cap', now() - interval '2 hours')
ON CONFLICT (id) DO NOTHING;

-- 4. Two more future notes for the schedule ledger: a proactive one and a
--    small-hours one that shows the quiet-hours hold.
INSERT INTO "NotisScheduledWake" (id, "subscriptionId", "runAfter", reason, origin, "createdAt") VALUES
('fake-sched-1', 'fake-sub-1', now() + interval '26 hours', 'Να ξαναδώ αν δημοσιεύτηκε η μελέτη για την Πανόρμου.', 'proactive', now()),
('fake-sched-2', 'fake-sub-2', date_trunc('day', now() AT TIME ZONE 'Europe/Athens')::timestamp AT TIME ZONE 'Europe/Athens' + interval '1 day 3 hours', 'Υποσχέθηκα απάντηση για τον κανονισμό τραπεζοκαθισμάτων.', 'reply', now())
ON CONFLICT (id) DO NOTHING;
