# Decision facts: what documents state, derived once in opencouncil

Status: **design agreed 2026-09-17**, to be implemented in one end-to-end session on the local
stack. Supersedes `2026-09-13-decision-facts-schema-design.md` where they differ; that document
keeps the survey findings and the argument for events (its Appendix A). Companion in
opencouncil-tasks: `.context/2026-09-16-finish-line-plan.md` (now a pointer to this file).

## 1. What this is

The minutes (Πρακτικά) print, per agenda item, who was in the room, who arrived or left, how the
vote went and who dissented. The pipeline reads each decision document (ΑΠΟΣΠΑΣΜΑ ΠΡΑΚΤΙΚΟΥ) and
today stores a per-subject *snapshot* computed in opencouncil-tasks, discarding the facts the page
stated. This design stores the facts and derives the per-subject view once, in opencouncil, from
stored rows, so that:

- a fix to name matching, roster or ordering re-derives for free, without re-reading documents;
- the clerk's attendance sheet and the transcript, the next two sources, write the same rows and
  need no second derivation;
- every gap between what was read and what is printed is an issue an admin can see.

Priority municipalities: Vrilissia, Zografou, Papagos-Cholargos; then Chalandri; then Athens; then
the rest.

## 2. Principles

1. **Store the finest-grained thing a source states; derive the aggregates.** A vote outcome
   (ομόφωνα, κατά πλειοψηφία) is a count over per-person vote rows. Per-subject presence is a
   replay of the roll call plus the stated arrivals and departures. Both aggregates are computed,
   never stored as facts.
2. **One derivation, in opencouncil, over stored rows.** It does not know which source wrote a
   row. Running it twice yields identical rows.
3. **Nothing is silent.** Where a fact is missing, unresolved or contradicted and something
   downstream depends on it, the derivation returns an issue, and the admin sees it next to the
   subject.
4. **Do not store what the stored facts can reproduce.** No provenance columns, no tally columns,
   no issue table: all three are views over the rows and the raw extraction.
5. **The document is the truth of the pipeline.** Official minutes are an evaluation instrument
   only; a document/minutes disagreement is an explained miss.

## 3. Decisions (2026-09-16 and 2026-09-17)

| decision | verdict |
| --- | --- |
| Derivation | moves to opencouncil; tasks reads documents and matches names, nothing more |
| Discussion order | transcript-derived (`sortSubjectsByDiscussionOrder`), nothing stored |
| Official minutes | evaluation only |
| Finish line | mergeable PRs with local e2e evidence; nothing pushed, nothing deployed, no backfill |
| Per-vote absence («Κατά τη διαδικασία της ψηφοφορίας απουσίαζε…») | two ordinary events: a departure *before* the document's subject and an arrival *after* it; tasks emits the pair |
| «δεν ψήφισαν υπέρ» (Chalandri ΔΣ `ΡΦΗ0ΩΗΔ-ΒΥΥ`) | AGAINST |
| `DecisionExtraction` table | dropped; its audit half becomes columns on `Decision`, its fact half is rows or the raw extraction |
| Provenance columns | not stored; computed and shown |
| Vote tally | not stored; the phrase is on `Decision`, the structured counts in the raw extraction; the derivation compares them to the rows |
| `DerivationIssue` table | not stored; issues are the derivation's output |
| Clock-time anchor | dropped (one document in 138 prints times, and it prints the item beside them) |
| `this_document` anchor | dropped; it is the document's own subject, held in `anchorSubjectId` |
| Phase anchor | kept, as a two-value enum (`PRE_AGENDA`, `OUT_OF_AGENDA`) resolved to the start of that block |
| Timing `before X` | same effect as `during X` in the replay; kept for the printed sentence |
| Stated per-decision list vs replay | the stated list wins for that subject **and resets the replayed state from it onward**; the implied change is an issue |
| Diff fallback (`buildAttendanceChanges`) | kept for meetings with no stored events; the preview tells superadmins which builder ran; deleted in the backfill PR |
| Roster from roles (`Role.isSubstitute`) | out; substitutes keep coming from the role title |
| Multi-part votes, substitutions as facts, sheet and transcript ingestion | out tonight; the schema holds them |
| Mayor | never in the member lists or the changes block; movement and stand-in printed in the parenthesis on the ΔΗΜΑΡΧΟΣ line |
| Presiding member | on the wire and in the raw extraction, no column |
| Conventions glossary | one source, i18n messages in opencouncil; the rendered English sentences travel on the wire as `conventionsText` |
| New body | `profile-body` task in tasks, admin confirms in the form |
| opencouncil base | branch off `feat/meeting-record-page` (PR #756) with `feat/extraction-e2e` merged; the PR stacks on #756 |

## 4. Schema

One table per thing a clerk writes down, plus the audit of one reading. Every fact table carries
`source` (`DataSource`), which is what makes the sheet and the transcript ingestion paths rather
than new derivations.

| table | the record of | change |
| --- | --- | --- |
| `MeetingAttendance` | the opening roll call, one row per person (the mayor included) | none |
| `AttendanceEvent` | one arrival or departure as stated, pinned to what the page pins it to, with the sentence | `anchorSubjectId String?` (relation to `Subject`); `AttendanceAnchorKind` becomes `AGENDA_ITEM \| DECISION_NUMBER \| SUBJECT \| PHASE \| SESSION_START \| SESSION_END`; `anchorPhase` becomes `AttendancePhase { PRE_AGENDA, OUT_OF_AGENDA }`; `anchorClockTime` dropped |
| `SubjectVote` | one row per person per subject; the full record of the vote (FOR rows included) | none |
| `SubjectAttendance` | derived: who was present for each subject | none; rebuilt by the derivation |
| `Decision` | the document: excerpt, references, number, and now what it states about the vote and the audit of the read | gains `voteResultPhrase String?`, `mayorPresent Boolean?`, `declaredItemNumber Int?`, `declaredOutOfAgenda Boolean?`, `incomplete Boolean @default(false)`, `unmatchedNames String[]`, `extractorVersion String?`, `extraction Json?` (the wire entry as received) |
| `DecisionExtraction` | — | dropped |
| `AdministrativeBody.decisionConventions` | how this body writes it | none |

Each model gets a `///` comment of two lines: what it is the record of, and what is derived from
it. The one on `SubjectAttendance` says it is the replay of `MeetingAttendance` plus
`AttendanceEvent`; the one on `AttendanceEvent` says why it is stored rather than diffed (anchor,
sentence, agreement count, recomputability; see the 2026-09-13 spec, Appendix A).

Why not derive events from per-subject rows, as outcomes are derived from votes: the direction is
the same, not the reverse. `SubjectVote` and `AttendanceEvent` are the two fine-grained records;
outcome and per-subject presence are their aggregates. Deriving events back from snapshots loses
the anchor (Athens 1η: 11/15 from diffs, 15/15 from events), depends on order and on gaps, cannot
be recomputed when matching is fixed, and has no row for the mayor or a per-vote absence.

**Migration.** Nothing is pushed, so the branch's three migrations (`decisionConventions`,
`AttendanceEvent`, `DecisionExtraction`) and the changes above become **one** migration named for
the feature, applied fresh to the local database (the three rows removed from `_prisma_migrations`,
the tables dropped, `migrate deploy`). Against `main` it is additive except for the enum values,
which no production row uses. Existing `SubjectAttendance`/`SubjectVote` rows are replaced on the
next derivation of each meeting.

## 5. The wire (opencouncil-tasks → opencouncil), task version 4

Tasks sends what each document states, matched to ids, plus the strings the match came from, and
nothing computed across documents.

Per document (`ExtractedDecisionResult`):

- as today: `subjectId`, `excerpt`, `references`, `decisionNumber`, `subjectInfo` (declared item
  number, out-of-agenda), `warnings`, `unmatchedMembers`; the extraction cache key is versioned
  (`#v4`), so readings cached before this branch are never served
- `rollCall: { layout, composition, present, absent, presentIds, absentIds }`: the lists as
  printed on **this page** (strings) and their resolved ids, never replayed
- `mayorPresent: { present, rawText } | null`; `presidedBy: { name, personId, rawText } | null`
- `voteResult` (phrase), `voteTally: Record<VoteType, number | null>` (structured, read from the
  page), `voteDetails` (named votes only, name and id; never an inferred FOR)
- `attendanceChanges` stated by this document: `type`, `anchor { kind, agendaItemIndex,
  nonAgendaReason, decisionNumber, subjectId, phase, timing }` (`subjectId` is the document's own
  subject, set only for `kind: subject`), `name`, `personId`, `rawText`
- `decisionAttendance: { present, presentIds, rawText } | null`: the page's own ΤΑ ΜΕΛΗ /
  ΑΠΟΧΩΡΗΣΑΝΤΕΣ list after the decision text, never the roll call (§11 item 2)
- `incomplete`: the extractor did not reach ΑΠΟΦΑΣΙΖΕΙ
- removed: the replayed `presentMemberIds`/`absentMemberIds`, `absentForVoteIds` (now the pair)

Per meeting (`extractions`):

- `initialAttendance` (the winning roll call, ids) and `unmatchedInitialAttendance`, as today: the
  vote across documents stays where the matcher is
- `attendanceEvents`: the changes resolved across documents, same shape as above plus
  `reportingPdfCount`/`totalPdfCount`
- removed: `nonDecisionSubjectAttendance`

The request gains `conventionsText` (the rendered sentences, §7); `conventions` (the JSON) stays
for the profiling task's benefit. The callback accepts a version-3 result unchanged: its snapshots
are ignored and the meeting is re-derived.

The extractor prompt: the anchor vocabulary loses `clock_time` and `this_document`; `phase` is the
two-value enum; per-vote absence is returned as the pair; the mayor's own arrival or departure is
an ordinary change; `presidedBy` is a new field; `voteTally` is structured. The structured-output
union limit (memory `structured-output-union-limit`) is counted before any field is added.

## 6. The derivation (`src/lib/derivation/`, opencouncil)

`deriveMeetingFacts(cityId, meetingId)` → `{ attendance: SubjectAttendanceRow[], votes:
SubjectVoteRow[], issues: Issue[] }`, written by `applyDerivation` inside one transaction
(delete rows with `source = decision` for the meeting, insert). Called after every poll callback
that stored anything, from `scripts/derive-meeting.ts <city> <meeting>`, and from the "re-derive"
action on the decisions page.

Inputs, all rows: subjects in transcript order (`sortSubjectsByDiscussionOrder`, withdrawn
excluded), `MeetingAttendance`, `AttendanceEvent`, each subject's `Decision` (phrase, named votes
and tally from `extraction`, the per-decision present list where the body states one), the body's
`decisionConventions`, the mayor's person id (from roles).

**Replay semantics**, unchanged from `effectiveAttendance.ts` in tasks, keyed by person id:

| event | effect |
| --- | --- |
| arrival during X / before X | present from X onward |
| arrival after X | absent for X, present from the next subject |
| departure during X / before X | absent from X onward |
| departure after X | present for X, absent from the next subject |
| decision number N, timing t | applied at the first subject whose own `decisionNumber` reaches N (≥ for during/before, > for after) |
| subject S (`anchorSubjectId`) | as agenda item S |
| phase PRE_AGENDA | applied before the first subject; phase OUT_OF_AGENDA before the first `outOfAgenda` subject in order |
| session start / end | present or absent throughout |
| unplaceable (no matching subject, no out-of-agenda subject for that phase) | no effect; issue `UNPLACEABLE_ANCHOR` |

Two events with the same person, kind and anchor are one event (idempotent). Where sources
disagree on a person's state at a subject the precedence is `attendance_sheet` > `decision` >
`transcript` (the first two values exist for later; tonight every row is `decision`), and issue
`SOURCES_DISAGREE` names both.

**Per subject, in order:**

1. If the body states per-decision attendance (`statesPerDecisionAttendance`) and this subject's
   document lists who was present: those rows are the attendance, and **the replayed state is
   reset to that list from this subject onward**. Any person whose state changed without a stated
   event is issue `IMPLIED_CHANGE` (with the name and the direction).
2. Else if `presentListMeaning` is `opening` or `cumulative`: the replayed state.
3. Else (`unknown`, or no conventions): no attendance rows; issue `PRESENCE_UNKNOWN`. The vote
   outcome for such a subject is printed from the phrase alone, with no named list.
4. Votes: the document's named votes become rows (a name that resolved to nobody is
   `UNMATCHED_NAME`). If the phrase permits inference (ομόφωνα, κατά πλειοψηφία, or a tally) and
   the page named nobody FOR, every present member without a named vote gets FOR. If the raw
   extraction carries a tally, each count is compared with the rows of that type; a difference is
   `TALLY_MISMATCH`.
5. The mayor is walked like any person (their events apply) but is excluded from the per-subject
   attendance and vote rows; the minutes print the mayor on the ΔΗΜΑΡΧΟΣ line with the parenthesis
   built from the roll call and the mayor's events («αποχώρησε μετά το 4ο θέμα»; «ΑΠΟΥΣΑ,
   προήδρευσε ο Αντιπρόεδρος Θ. Μετικαρίδης» from `presidedBy` in the raw extraction).

**Issues** (`code`, `severity`, `subjectId?`, `personId?`, `decisionId?`, `source`, `message`,
`rawText?`), returned with the rows and never stored:

| code | when |
| --- | --- |
| `NO_ROLL_CALL` | no document yielded a winning roll call |
| `PRESENCE_UNKNOWN` | the body's present-list meaning is unknown |
| `CONVENTIONS_UNCONFIRMED` | `provenance.source` is still `profile` |
| `UNMATCHED_NAME` | a printed name resolved to nobody in the roster |
| `UNPLACEABLE_ANCHOR` | an event's anchor lands on no subject |
| `IMPLIED_CHANGE` | a stated per-decision list differs from the replayed state without a stated event |
| `TALLY_MISMATCH` | a printed count disagrees with the derived rows |
| `INCOMPLETE_READ` | the extractor did not reach ΑΠΟΦΑΣΙΖΕΙ |
| `PRESIDING_DISAGREES` | documents of one meeting name different presiding members |
| `SOURCES_DISAGREE` | two sources state different values for one fact |

Each row also carries a computed marker, `stated` or `inferred` (votes) and `stated` or
`derived` (attendance), shown on the page and used by the checker; not stored.

Every fact a later source writes lands in the same three tables and the same function runs:

| source | roll call | events | votes |
| --- | --- | --- | --- |
| decision document | winning roll call, `decision` | as stated, with anchors | named votes; phrase and tally on `Decision` |
| clerk's sheet | the ticks, `attendance_sheet` | "19:45, before item 23" → `AGENDA_ITEM 23, BEFORE`, the time in `rawText` | the sheet's dissenters per item as rows; no phrase |
| transcript | a roll-call announcement, `transcript` | an utterance belongs to a subject's segment → `SUBJECT <that>, DURING` | «ομόφωνα» / «κατά η κ. Χ» in the president's utterance as rows |

## 7. Conventions

- **Glossary**: one i18n message per enum value of `DecisionConventions`, `el` label and
  description for the admin form, `en` sentence for the model, in `messages/*/admin.json`. The
  poll request carries `conventionsText`, the `en` sentences rendered by opencouncil; tasks pastes
  them into the prompt and `conventionHints()` is removed.
- **Admin form** on the administrative body: each convention with its description; edit and
  confirm; confirming writes `provenance.source = 'manual'`, `confirmedBy`, `confirmedAt`. Server
  action in `src/lib/db/administrativeBodies.ts`.
- **Re-import pass** before any confirmation: the stored rows against the survey notes, with the
  known error fixed (Chalandri ΔΣ prints ΤΑ ΜΕΛΗ per decision, so `statesPerDecisionAttendance:
  true`). Rows stay `profile`.
- **New body**: register it with its Diavgeia organisation id; run the `profile-body` task
  (opencouncil-tasks; the survey's `observe-documents` → `body-facts` over the body's last N
  documents, Sonnet) which returns a conventions object with `source: 'profile'`; confirm in the
  form; poll. Exposed as a task endpoint and a CLI command.

## 8. Where it surfaces (on PR #756's decisions page)

- **Per subject row**: the minutes line gains what the document stated (roll call as printed, vote
  phrase and named votes, changes with their sentences, the mayor sentence) and the subject's
  issues, each with code, name and sentence. Names in the attendance and vote lists are marked
  stated or inferred. The "Has gaps" filter also selects rows with issues.
- **Rail**: an issues card, grouped by code with counts; `PresenceCard` and
  `AttendanceChangesCard` show the stated rows.
- **Header**: "Re-derive" beside "Preview minutes" and "Export DOCX".
- **Minutes preview** (superadmin): one line saying whether the changes block came from stored
  events or the diff fallback, and the issue count. The DOCX does not change.
- **Administrative body form**: §7.
- **`scripts/check-minutes.ts`**: prints the meeting's issues under its claims.
- **Admin overview** (`/admin/decisions`): issue counts per meeting, one query over the fact
  columns.

Nothing blocks: minutes still generate; issues annotate.

## 9. How we know it works

| level | command | done when |
| --- | --- | --- |
| document | `evaluate-decision-extraction fixtures/extraction-golden.json --skip-cache` (tasks) | 142 read (138 + Zografou `ΨΥ5ΟΩΡΦ-ΘΙΣ`, `9ΤΘΕΩΡΦ-ΕΡΩ`, `9ΑΚΤΩΡΦ-ΚΙΕ`, `Λ2ΑΣΩΡΦ-Ψ70`); subject ≥ 134/138; rollCall, attendanceChanges, perVoteAbsence, votes no worse than 2026-09-14 (133, 125, 5/5, 129); the four new documents agree on roll call, changes and the mayor sentence |
| meeting | `npx tsx scripts/check-minutes.ts` (opencouncil) | ≥ 102/109 from stored rows alone; the 20 Vrilissia/Zografou/Papagos meetings ≥ 59/64; Chalandri 18η 28/30; Athens 1η 15/15; new Zografou claims (mayor departure after item 4, arrival after item 8) agree |
| derivation | `scripts/derive-meeting.ts` twice, rows diffed | identical |
| loop | `scripts/e2e-meeting.sh` with `--force` on Papagos 31/8, Chalandri 26/8, Athens 30/3 | rows equal to the standalone derivation; Papagos shows the per-vote pair; Chalandri item 7 shows `IMPLIED_CHANGE` on the page |
| conventions | the form on the local stack | Zografou ΔΕ confirmed as the dev superadmin (mechanism, not values); `profile-body` on one body returns a conventions object |
| suite | both repos | typecheck, tests, lint green before each commit |
| self-review | `/review-pr` (`~/.claude/skills/review-pr/SKILL.md`, base-branch mode) run in a subagent per repo | every finding either fixed or answered in the report |

Model spend ceiling for the night: $150 (a fresh scorer run is about $5; forced polls and
`profile-body` are the other consumers).

## 10. Order of work (one session, riskiest first)

1. **Base and schema**: opencouncil branch off `feat/meeting-record-page` + merge
   `feat/extraction-e2e` (dry merge: no conflicts); tasks branch off `feat/extraction-e2e`; the
   single migration; `///` comments; local database reset. Done when the app boots and the
   existing checker still scores.
2. **Derivation**: §6 over the rows already stored locally; callback calls it and ignores
   snapshots; script and action. Done when the checker scores ≥ 102/109 twice identically.
3. **Wire**: §5 on both sides, version 4. Done when the forced polls reproduce the rows.
4. **Extractor**: invented agenda numbers (12 documents print none, extraction returns `#1`/`OA1`);
   Orestiada `6ΙΥΣΩΞΒ-8ΗΑ` failing the batch API; mayor movement and `presidedBy`; the four
   documents in the fixture. Done when the scorer table holds.
5. **Conventions**: §7. Done when Zografou ΔΕ is confirmed on the local stack.
6. **Surfacing**: §8. Done when Athens shows its four departures with sentences and Chalandri its
   issue.
7. **Self-review, mandatory**: for each repo, run the `/review-pr` skill
   (`~/.claude/skills/review-pr/SKILL.md`; it may not be invocable as a slash command from an
   autonomous session, so the subagent is pointed at the file) **in a subagent**, so the review
   carries none of this session's context, in base-branch mode against `feat/meeting-record-page`
   (opencouncil) and `feat/extraction-e2e` (tasks). Fix what it finds or answer it in the report.
8. **Report**: `.context/2026-09-17-e2e-report.md` in tasks with both tables, the review findings
   and their resolution, and every remaining miss with its cause; nothing pushed.

Out tonight: multi-part votes, roster from roles, substitutions as facts, sheet and transcript
ingestion, official minutes for Chalandri 15η–17η, the excerpt-length tolerance (reported, not
fixed), production backfill, deploy.

## 11. Deviations taken during implementation (2026-09-17, for review)

Each is one switch or one field; veto by saying so.

1. **Unsettled present-list meaning is replayed as an opening roll call**, not skipped (§6 rule 3
   strict form). Every body measured so far behaves as opening, and the strict rule made the
   checker unclosable for most bodies. Each such subject carries `PRESENCE_UNKNOWN` until the body's
   conventions are confirmed. Switch: `ASSUME_OPENING_WHEN_UNKNOWN` in `src/lib/derivation/replayAttendance.ts`.
2. **The per-decision list is its own extracted field** (`decisionAttendance`: the ΤΑ ΜΕΛΗ /
   ΑΠΟΧΩΡΗΣΑΝΤΕΣ list after the decision text), never the roll call. Telling the extractor to
   overwrite `presentMembers` with it made the roll call ambiguous; Chalandri ΔΣ proved it.
3. **A meeting whose documents predate stored facts keeps its rows** and reports
   `NO_STORED_FACTS` instead of being wiped to nothing; a re-poll fills the facts. This is what
   keeps a deploy before the backfill from emptying production minutes.
4. **Issue codes added**: `NO_STORED_FACTS`; `SOURCES_DISAGREE` is produced today for a roll-call
   row conflict, a per-decision list contradicting a stated event, two named votes for one person,
   and two conflicting events at one subject.
5. **Presence for a person seen only in events** starts on the far side of their first event
   (arrival → absent before, departure → present before); a `cumulative` list starts every person
   with an arrival event as absent.
6. **Per-vote absence in the seeded meetings**: no linked document in the local database prints
   one (the Papagos claims name blank votes); the pair is proven by the pipeline tests and a fresh
   read of Orestiada `Ψ6ΘΡΩΞΒ-8ΡΨ`, not end to end.
7. **The mayor votes on bodies they sit on.** On the Δημοτική Επιτροπή the mayor presides and is a
   member: they vote like everyone else and the printed «7 ΥΠΕΡ» counts them. On the Δημοτικό
   Συμβούλιο the mayor attends and has no vote. Implemented as `mayorIsMemberOf(mayor, body, date)`
   (an active role on that body): the mayor is left out of per-subject rows only where it is false.
   The ΔΗΜΑΡΧΟΣ line and its note are unchanged either way. Confirmed on Vrilissia 15/7 and 10/6.
8. **Vrilissia, both bodies: `presentListMeaning = opening`**, set 2026-09-18 from eleven council
   and nineteen committee pages: every stated arrival sits in the absent list, every stated
   departure in the present list. One council page (`ΨΧΙ0Ω9Ρ-ΜΘΩ`, 48 pages, an embedded committee
   decision below the council's own lists) came back with its two arrivals inside the present list
   and the president dropped from it: a misread, now in the extraction fixture with the roll call as
   printed; no code rule was added, pending the cross-body prompt pass.

## Appendix: representative documents

- Per-vote absence: Papagos-Cholargos ΔΕ `6ΘΘΘΩΞ1-ΨΣΖ` («Κατά τη διαδικασία της ψηφοφορίας
  απουσίαζε η κ. Αναστασία Χαμηλοθώρη – Κουγιουμτζοπούλου»), ΔΣ `6ΝΕΓΩΞ1-ΗΛΖ`; Orestiada ΔΣ
  `Ψ6ΘΡΩΞΒ-8ΡΨ`. (`ΨΙΤ4ΩΞ1-7ΑΚ`, cited earlier, names two blank votes instead; none of the three
  is linked to a seeded meeting.)
- Decision-number anchor: Athens ΔΣ 1η 2026-03-30 («απεχώρησε στην 286 ΑΚΣ»).
- Phase anchor: Vrilissia ΔΣ `6ΞΖ5Ω9Ρ-ΣΕ7` («προσήλθε κατά τις ερωτήσεις της προ ημερησίας
  διάταξης»), `9Ο6ΒΩ9Ρ-Τ5Β`; Chalandri `ΨΟΔΗΩΗΔ-ΥΕ4` («κατά τη διάρκεια της προ ημερησίας»).
- Stated per-decision list: Chalandri ΔΣ (ΤΑ ΜΕΛΗ at the foot of each document), Argos
  (ΑΠΟΧΩΡΗΣΑΝΤΕΣ).
- Mayor movement: Zografou ΔΣ `ΨΥ5ΟΩΡΦ-ΘΙΣ` («Η Δήμαρχος ήταν παρούσα κατά την έναρξη … και
  αποχώρησε μετά τη λήξη της συζήτησης του 4ου τακτικού θέματος»), `9ΤΘΕΩΡΦ-ΕΡΩ` («απουσίαζε κατά
  την έναρξη … και προσήλθε στη λήξη της συζήτησης του 8ου θέματος»).
- Presiding in the mayor's absence: Zografou ΔΕ `9ΑΚΤΩΡΦ-ΚΙΕ`, `Λ2ΑΣΩΡΦ-Ψ70` («ο Αντιπρόεδρος …
  ΜΕΤΙΚΑΡΙΔΗΣ ΘΕΟΔΩΡΟΣ, ο οποίος προήδρευσε λόγω της απουσίας της Δημάρχου - Προέδρου»).
- «δεν ψήφισαν υπέρ»: Chalandri ΔΣ `ΡΦΗ0ΩΗΔ-ΒΥΥ`.
