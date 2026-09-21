# Decision facts: storing what documents state, deriving minutes once

Status: **partially implemented on branch `feat/extraction-e2e`** (opencouncil and opencouncil-tasks),
verified on a local stack, not deployed, not pushed. Last updated 2026-09-16; the plan to finish is
`.context/2026-09-16-finish-line-plan.md` in opencouncil-tasks.

## In one paragraph

The meeting minutes (Πρακτικά) print, per agenda item, who was in the room, who arrived or left,
how the vote went and who dissented. Today the pipeline extracts each decision document (ΑΠΟΣΠΑΣΜΑ
ΠΡΑΚΤΙΚΟΥ from Diavgeia) into a per-subject *snapshot* of presence and votes, and the minutes
reconstruct arrivals and departures by diffing snapshots. The facts the documents actually state
(the roll call, «ο κ. Χ απεχώρησε στην 286 ΑΚΣ», «Κατά τη διαδικασία της ψηφοφορίας απουσίαζε…»,
«με 12 υπέρ και 3 κατά») are discarded on write, and the 31 administrative bodies of the 12
supported municipalities state them in different shapes. This design stores the stated facts and
each body's conventions, derives the per-subject view once, and measures the result against real
meetings. It is grounded in a survey of 1,104 documents across all 31 bodies, a human-reviewed
fixture of 138 documents, and a meeting-level check against 22 meetings, one of them against the
municipality's own verbatim πρακτικό.

## Status at a glance

| # | element | status | evidence |
| --- | --- | --- | --- |
| 1 | Conventions per body (`AdministrativeBody.decisionConventions`) | **built**, admin form not | 31 bodies imported; sent with every poll; read by the extractor as a prompt preface |
| 2 | Stated facts per document (`DecisionExtraction`) | **built** (reduced) | persisted from the poll callback; vote phrase + tally, declared item number, incomplete flag, unmatched names, raw entry |
| 3 | Attendance events with anchors (`AttendanceEvent`) | **built** for arrivals/departures | minutes print Προσελεύσεις/Αποχωρήσεις from events, «στην 286 ΑΚΣ» as the anchor; per-vote absence handled in the extractor, not yet stored as an event |
| 4 | One derivation in opencouncil, provenance columns | **not built** | tasks still computes the per-subject snapshot; opencouncil stores it; events are read only for the changes block |
| 5 | Discussion order | **decided: transcript order, nothing stored** | resolved by moving derivation (§4) |
| 6 | Multi-part votes (`DecisionVotePart`) | **not built** | reference document `Ψ7ΠΥΩΞ1-ΘΩΧ` stores part A only |
| 7 | Roster from roles, substitute as a role flag | **not built** | ΣΥΝΘΕΣΗ still counts roll-call rows |
| — | Extractor: anchors, per-vote absence, abbreviated names, long documents, conventions hints, named ΥΠΕΡ lists | **built** | document scorer, 138 documents, see below |
| — | Meeting-level golden fixture and checker | **built** | 22 meetings, 109 claims, 102 agree |

What "works" means today: on the local stack a poll runs opencouncil → tasks → extraction →
callback → the tables above → minutes data, and the checker holds that against the fixture. The
meeting checked against an official πρακτικό (Chalandri ΔΣ 18η, 2026-08-26) agrees on 28 of 30
claims; the two misses are one fact on which the document and the official minutes disagree.

## Problem

- Per-subject attendance is stored as a snapshot (`SubjectAttendance`) computed in opencouncil-tasks
  by replaying arrivals and departures along the PDF-declared order. opencouncil then
  **reconstructs** arrivals and departures by diffing consecutive snapshots along a *different*
  order (transcript timestamps). The events themselves were never stored.
- The named ΥΠΕΡ list is inferred from presence minus dissenters and stored in `SubjectVote`
  indistinguishably from a read fact. When presence is wrong, absent members are printed as
  voting for. Observed on Athens 1η, 2026-03-30: four members listed absent by the document
  stored as FOR.
- What "present" means differs per body — a cumulative list in six bodies, the opening roll
  call in seven — and nothing recorded which. Changes pinned to a decision number, a session
  phase or a clock time (ten of the 31 bodies) arrived with a null agenda item and were dropped.
- Facts the documents state had no field: per-vote absence printed after the decision
  (Papagos-Cholargos and Orestiada, both bodies), per-decision attendance (Argos, Chalandri,
  Athens 1η by decision number), substitutions, two-part votes, participation mode, the vote
  phrase and its tally, the document's own item number.
- ΣΥΝΘΕΣΗ (N) is whoever has a roll-call row, short of the body in most meetings.

Two thirds of the measured extraction gap (109 of 172 issues over 140 documents) was "no field
exists". The schema changes; the requirements come from the corpus.

## Decisions already taken (2026-09-13, product)

- The minutes keep printing the derived ΥΠΕΡ list unmarked. Provenance is stored so the list is
  *correct*, not so it is labelled.
- Where a body's documents do not state a fact and its conventions say it cannot be derived, the
  minutes print nothing for it rather than carrying a neighbour's value forward.
- Conventions live on `AdministrativeBody`, written by profiling, confirmed by a person in admin.
- One document ↔ one subject stays (`Decision.subjectId @unique`).

## Design

### 1. Conventions on the body — built

```prisma
model AdministrativeBody { ... decisionConventions Json? }
```

```ts
type DecisionConventions = {
  version: 1;
  rollCallLayout: 'composition_and_absent' | 'present_and_absent' | 'present_only' | 'mixed';
  presentListMeaning: 'opening' | 'cumulative' | 'unknown';   // the decisive axis
  attendanceChangeAnchors: Array<'agenda_item' | 'decision_number' | 'clock_time' | 'session_phase' | 'this_document'>;
  statesPerDecisionAttendance: boolean;   // Argos ΑΠΟΧΩΡΗΣΑΝΤΕΣ, Chalandri ΔΣ, Athens 1η
  statesPerVoteAbsence: boolean;          // «Κατά τη διαδικασία της ψηφοφορίας απουσίαζε…»
  usesSubstitutes: boolean;
  namedVoters: 'none' | 'dissenters_only' | 'all';
  mayorStatedSeparately: boolean;
  notes?: string;
  provenance: { source: 'profile' | 'manual'; profiledAt?: string; documentsSampled?: number; confirmedBy?: string; confirmedAt?: string };
};
```

Type in `src/lib/decisionConventions.ts`; import from the survey in
`scripts/import-body-conventions.ts`; carried on `PollDecisionsRequest.conventions`; turned into a
prompt preface by `conventionHints()` in opencouncil-tasks. **Not built:** the admin form field to
confirm them; nothing in opencouncil reads them yet (§4 will). Several bodies hold
`presentListMeaning: 'unknown'` where the survey could not settle it.

### 2. Stated facts, verbatim, per document — built, reduced

```prisma
model DecisionExtraction {
  decisionId String @unique
  extractorVersion String?
  voteResultPhrase String?          // «Κατά πλειοψηφία με 12 υπέρ και 3 κατά»
  voteTallyFor / voteTallyAgainst / voteTallyBlank Int?
  declaredItemNumber Int?           // the document's own «ΘΕΜΑ 3ο», null when none printed
  declaredOutOfAgenda Boolean?
  mayorPresent Boolean?
  incomplete Boolean
  unmatchedNames String[]
  raw Json                          // the decision's entry in the poll result, as received
  taskId String?
}
```

Persisted by `storeDecisionExtraction()` inside the per-subject callback transaction; the tally is
read by `parseVoteTally()`. **Reduced from the draft:** the raw present/absent names as printed
and the attendance layout are not on the wire yet, so they are not stored; `raw` holds the wire
entry, not the extractor's full output.

### 3. Attendance events, not snapshots — built for arrivals and departures

```prisma
model AttendanceEvent {
  councilMeetingId, cityId, personId
  kind       AttendanceEventKind          // ARRIVAL | DEPARTURE
  anchorKind AttendanceAnchorKind         // AGENDA_ITEM | DECISION_NUMBER | CLOCK_TIME | SESSION_PHASE | THIS_DOCUMENT | SESSION_START | SESSION_END
  anchorAgendaItemIndex Int?  anchorNonAgendaReason NonAgendaReason?
  anchorDecisionNumber String? anchorClockTime String? anchorPhase String?
  timing     AttendanceTiming?            // BEFORE | DURING | AFTER
  rawText    String
  reportingDocuments Int  totalDocuments Int   // how many of the session's documents stated it
  source DataSource  taskId String?
}
```

The extractor returns each change with its anchor (`anchor.kind` + value); the pipeline resolves
changes across the session's documents by person and anchor; the callback stores them; the minutes
build Προσελεύσεις/Αποχωρήσεις from stored events (`buildAttendanceChangesFromEvents`), placing a
decision-number anchor on the first subject whose own decision reaches it and printing «στην 286
ΑΚΣ» instead of a subject label. The attendance-diff reconstruction remains as the fallback for
meetings polled before events existed.

**Per-vote absence** («Κατά τη διαδικασία της ψηφοφορίας απουσίαζε…») is extracted as its own
change type, removed from that decision's present list in the pipeline, and sent as
`absentForVoteIds`; it is **not yet stored as an event** (it lands only inside
`DecisionExtraction.raw`). **Not built from the draft:** `ABSENT_FOR_VOTE` / `PRESENT_FOR_VOTE` /
`SUBSTITUTES` kinds, `anchorSubjectId`, `sourceDecisionId`, the uniqueness constraint,
`MeetingAttendance.participationMode` / `viaSubstitute`.

### 4. Derivation happens once, in opencouncil, from stored facts — not built

`SubjectAttendance` and `SubjectVote` become derived tables rebuilt by one function:

```
deriveSubjectFacts(meeting):
  roster        = active Roles on the body at meeting date (+ substitutes flagged)
  conventions   = body.decisionConventions
  order         = meeting.discussionOrder (§5)
  rollCall      = MeetingAttendance rows
  events        = AttendanceEvent rows, anchors resolved against `order`
  for each subject in order:
    if conventions.statesPerDecisionAttendance and a THIS_DOCUMENT event set exists for it:
        attendance = that set                                provenance STATED
    else if conventions.presentListMeaning != 'unknown':
        attendance = replay(rollCall, events, upTo subject)  provenance DERIVED
    else: no rows (the minutes print nothing)
    votes: explicit rows from DecisionExtraction             provenance STATED
           FOR inferred for attendance − explicit − absent-for-vote   provenance INFERRED
           a stated tally that disagrees with the inferred count is flagged
```

```prisma
model SubjectAttendance { ... provenance FactProvenance @default(DERIVED) }
model SubjectVote       { ... provenance FactProvenance @default(INFERRED); part Int? }
enum FactProvenance { STATED DERIVED INFERRED }
```

Today the replay still runs in opencouncil-tasks (`effectiveAttendance.ts`, now anchor-aware:
decision-number anchors are placed by comparing the subject's own decision number) and its output
is what opencouncil stores. Moving it here is what makes a fix to matching, roster or ordering
re-derivable without re-reading documents at model cost.

### 5. Discussion order — decided 2026-09-16: the transcript order, as today

No stored order. The minutes and the derivation (§4) both use `sortSubjectsByDiscussionOrder`
(first utterance timestamps, agenda order as fallback); opencouncil-tasks no longer needs an
order once §4 lands, which removes the two-orderings defect by construction. No limitation of the
transcript order was found in the runs.

### 6. Multi-part votes — not built

```prisma
model DecisionVotePart { decisionId, index Int, label String?, resultPhrase String?  @@unique([decisionId, index]) }
```

`SubjectVote.part` refers to it. Reference document `Ψ7ΠΥΩΞ1-ΘΩΧ` (Papagos ΔΣ): part A κατά
πλειοψηφία with two against and one blank, part B ομόφωνα with two blank.

### 7. The roster is the roster — not built

ΣΥΝΘΕΣΗ (N) and the committee ΠΑΡΟΝΤΑ/ΑΠΟΝΤΑ lists come from active `Role`s, `MeetingAttendance`
supplies status only, and substitute membership becomes `Role.isSubstitute` instead of the literal
role name «Αναπληρωματικό Μέλος».

## What does not change

`Decision` (one per subject, excerpt, references, number, meeting date), `DecisionCandidate`, the
matching flow, the reading fixture, `Subject.withdrawn`.

## Migration and backfill

1. Additive migrations only. Three landed: `decisionConventions`, `AttendanceEvent`,
   `DecisionExtraction`.
2. When §4 lands: existing `SubjectAttendance` rows → `DERIVED`; existing `SubjectVote` FOR →
   `INFERRED`, others → `STATED`.
3. `DecisionExtraction` fills on the next poll of each meeting; older tasks versions send no
   events, and the minutes fall back to the diff for those meetings.
4. Conventions were imported with `provenance.source = 'profile'`; confirmation is manual.

## Measurement

**Document level** — `evaluate-decision-extraction` over `fixtures/extraction-golden.json`
(opencouncil-tasks; 138 documents across all 31 bodies, every label with provenance:
`true` a person confirmed, `"agreed"` two independent readings matched, `"unresolvable"` reviewed
and undecidable). Fresh reads with the current extractor: rollCall 133/138, attendanceChanges
125/138, perVoteAbsence 5/5, votes 129/134, subject 126/138, excerpt 127/138. Open: twelve invented
agenda numbers on pages that print none; excerpt-length drift between runs; one 35-page Orestiada
document that fails the batch API on every run.

**Meeting level** — `scripts/check-minutes.ts` over `fixtures/minutes-golden.json` (opencouncil;
22 meetings). Athens 1η 2026-03-30 (reviewed documents): 15/15. Chalandri ΔΣ 18η 2026-08-26
(official contractor πρακτικό): 28/30. Twenty Vrilissia / Zografou / Papagos-Cholargos meetings
(claims derived from reviewed documents): 59/64. Total 102/109.

## How to see it yourself

The local stack (memory `extraction-e2e-local-setup`): Postgres on 5439 seeded from production with
114 meetings, tasks server on 3005, app on 3010 (open `http://localhost:3010`, sign in as the
development super admin from the dev panel).

1. **A meeting's decisions and what was stored** —
   `http://localhost:3010/el/athens/mar30_2026/decisions` (Athens 1η, four documents, the
   departures «στην 286 ΑΚΣ»), `http://localhost:3010/el/chalandri/aug26_2026/decisions`
   (Chalandri ΔΣ 18η, thirteen documents). Each row links the Diavgeia PDF.
2. **The minutes as they would print** — the meeting's admin page → Πρακτικά preview
   (`MinutesPreviewDialog`), or the DOCX at
   `http://localhost:3010/api/cities/chalandri/meetings/aug26_2026/minutes`. Compare
   Chalandri's with `.extraction-survey/official-minutes/chalandri/ds_18i_praktika_2026-08-26.pdf`
   in opencouncil-tasks: roll call pages 2–3, «Προσελεύσεις: Ουδείς. Αποχωρήσεις: Πριν τη
   συζήτηση του 5ου θέματος αποχώρησε η κ. Π. Ζορμπά» page 4, item 13 withdrawn.
3. **The tables** — `nix run .#studio -- --db-url 'postgresql://opencouncil@127.0.0.1:5439/opencouncil?sslmode=disable'`
   in the opencouncil worktree: `AttendanceEvent`, `DecisionExtraction`, `SubjectAttendance`,
   `SubjectVote`, `MeetingAttendance`, and `AdministrativeBody.decisionConventions`.
4. **Re-run a meeting and re-check** — in the opencouncil worktree,
   `scripts/e2e-meeting.sh athens mar30_2026 --force` then `npx tsx scripts/check-minutes.ts athens/mar30_2026`.

## Decisions to review and challenge

1. **Events as the source, snapshots as the derived view** (§3–4) — **accepted 2026-09-16**;
   derivation moves to opencouncil. Per-vote absence becomes the event kind `ABSENT_FOR_VOTE`
   pinned to the decision's subject.
2. **Conventions as a JSON column** vs. typed columns, and whether extraction should be *told* the
   layout (built) or only the derivation should read it. Telling the extractor measurably helped
   Zografou ΔΕ and Papagos.
3. **Which record wins when the document and the official πρακτικό disagree** — **decided**:
   official minutes are an evaluation instrument only; the pipeline is faithful to the document
   and such a miss is explained, not fixed.
4. **Discussion order** — **decided**: transcript-derived, nothing stored.
5. **`DecisionExtraction.raw` as Json** vs. typed columns per fact; and whether the raw names as
   printed should be on the wire (they are needed for re-derivation of matching).
6. **A vote value for «δεν ψήφισαν υπέρ»** (Chalandri `ΡΦΗ0ΩΗΔ-ΒΥΥ`): neither ΚΑΤΑ nor ΛΕΥΚΟ.
7. **Task version bump** before any deploy of the tasks branch: the extractor prompt and schema
   changed; the result shape gained optional fields only.

## Appendix A — why events and stated facts, when #173 decided against them

Issue #173 proposed `MeetingAttendanceChange`, then kept only `SubjectAttendance` + `SubjectVote`
because "this information is captured at the subject level", deriving arrivals and departures from
snapshot diffs. That was reasonable on its premise; the premise did not hold: per-subject attendance
is a derivation, not a fact, and only its output was stored.

- Ten of the 31 supported bodies pin changes to something that is not a subject: a decision number
  (seven bodies), a session phase (one), or the document's own vote (two). A snapshot cannot say
  «στην 286 ΑΚΣ»; the diff can only say "gone since #23". Athens 1η scored 11/15 meeting-level claims
  with snapshots and 15/15 once events existed.
- The diff reconstructs along transcript order while the snapshots were derived along PDF order, so a
  change can attach to the wrong item or invert direction.
- Snapshots cannot be recomputed when an input is fixed (name matching, roster, ordering, anchors);
  every such fix required re-reading the documents at model cost. Events plus roll call re-derive for
  free. #173 itself notes the diff gives "between which subjects, but not the exact timing" — lossy in
  the direction that cannot be undone.
- A subject without a document breaks the diff chain; one differently read document invents a change.
  Events carry how many documents stated them.
- Per-vote absence is neither arrival nor departure; without an event it is an unexplained ABSENT, or a
  wrong ΥΠΕΡ.
- Corrections are one fact per event, not one row per later subject; `DataSource.manual` was never
  written for that reason.

`SubjectAttendance` remains the derived, query-shaped table; events are the source; provenance says
which is which. `DecisionExtraction` exists for the same reason on the vote side: the phrase and
tally (the only check on a derived ΥΠΕΡ count), the document's own item number, the incomplete flag,
the unmatched names, and the extractor version were all discarded on write, and `TaskStatus.responseBody`
is per task, overwritten, and not queryable per decision.

## Appendix B — future sources: the transcript and the clerk's attendance sheet

Two more sources of presence and votes are planned: the transcript, and the sheet the
municipality's clerk keeps during the session — a roster with presence ticks, arrivals and
departures noted as they happen (usually with a time or "before item N"), and per subject the
outcome and the dissenters.

Both are event-shaped. The sheet *is* an opening roll call plus an event log plus per-subject vote
statements; the transcript yields events at timestamps (a roll-call announcement, «ο κ. Χ
αποχωρεί», «ομόφωνα», «κατά η κ. Καρατζά») and the discussion order. Neither carries "presence
per person per subject"; under the snapshot model that would have to be computed at ingestion and
the source discarded.

- The document («στην 286 ΑΚΣ»), the sheet ("19:45, before item 23") and the transcript (an
  utterance at 19:44) describe one event with three anchors. Stored as events, reconciliation is a
  join and disagreement is visible.
- Derivation stays single: roll call + events + order in, per-subject presence and votes out,
  provenance recording which sources contributed. A new source is an ingestion path, not a second
  derivation.
- The sheet is the best ground truth available — the ΑΠΟΣΠΑΣΜΑ and the official πρακτικό are both
  written from it — and `fixtures/minutes-golden.json` already has its shape, so a transcribed sheet
  feeds `scripts/check-minutes.ts` directly. It ranks above the document when they disagree.
- `DataSource` gains `attendance_sheet`; `MeetingAttendance` and `AttendanceEvent` already carry
  `source`; the derived rows record the sources they came from; the discussion order is stored once
  with its source.
