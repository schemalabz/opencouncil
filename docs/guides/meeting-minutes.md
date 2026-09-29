# Meeting Minutes Generation

## Concept

A system for generating official meeting minutes (πρακτικά συνεδρίασης) from council meetings. Minutes combine transcript data, agenda subjects, and the facts stated in the decision documents each administrative body publishes on Diavgeia. They are rendered as a DOCX that municipalities can use as their official record. The same facts feed the decisions page and the voting records.

The governing rule: **Store the finest-grained thing a source states; derive the aggregates.** A page states its own roll call, its own arrivals and departures, a vote phrase and the members it names. opencouncil combines every page's statement into one roll call and one set of events (below). Who was present for each subject and who voted FOR are computed from that, never stored as facts.

## How a page becomes the minutes

```mermaid
flowchart TB
    pdf["Decision PDF on Diavgeia<br/>one per subject"]
    subgraph tasks["opencouncil-tasks — one page at a time"]
        read["Read<br/>the model reads one page;<br/>conventions arrive as prompt text"]
        match["Match names<br/>token-sort, then one LLM call per poll"]
    end
    subgraph app["opencouncil — every page of the meeting"]
        store["Store<br/>Decision.extraction, one row per page"]
        load["Load<br/>readings of task v4 or later"]
        resolve["Resolve<br/>opening roll call and session changes,<br/>by convention"]
        derive["Derive<br/>presence per subject, votes, issues"]
        write["Write, one transaction<br/>SubjectAttendance · SubjectVote ·<br/>MeetingAttendance · AttendanceEvent (output)"]
        show["Minutes · decisions page · issues"]
    end
    conv[("Body conventions")]
    manual[("Manual rows<br/>(later: transcript)")]
    pdf -->|one PDF| read --> |names as printed| match
    match -->|"wire: one entry per page, names + ids"| store
    store -->|every stored page| load -->|usable readings| resolve -->|roll call + events| derive -->|rows + issues| write --> show
    conv -.->|prompt text| read
    conv -.->|rules| resolve
    conv -.->|rules| derive
    manual -.->|outrank the pages| resolve
```

opencouncil-tasks reads one page and matches its names; it never computes a fact from two or more pages. opencouncil stores each page's reading as it arrives and combines every stored page. A later poll only adds pages. `MeetingAttendance` and `AttendanceEvent` rows of source `decision` are derivation output, never read back; rows of any other source are stated facts and outrank the pages.

## Architectural split

Two repos:

1. **opencouncil-tasks** — the LLM work. It searches Diavgeia, matches decisions to subjects, and reads each matched PDF. It returns what the page *states*, with names resolved to person ids. It infers nothing across documents.
2. **opencouncil** — owns the data, the derivation and the rendering. It stores the stated facts and derives per-subject attendance and votes from them. It renders DOCX on demand, and shows the admin what could not be derived.

Once a meeting's documents are read, everything downstream runs without the task server: re-deriving and re-rendering are instant and cost nothing.

## The moving parts

```mermaid
flowchart LR
    PDF[Diavgeia PDFs]

    subgraph tasks [opencouncil-tasks]
        X[extractor<br/>what each document states]
    end

    subgraph oc [opencouncil]
        C[(AdministrativeBody<br/>decisionConventions)]
        A[admin form]
        F[(stated facts<br/>Decision readings · manual rows)]
        D[derivation<br/>roll call, changes, per-subject<br/>attendance and votes; issues]
        R[(SubjectAttendance · SubjectVote<br/>MeetingAttendance · AttendanceEvent)]
        M[minutes<br/>DOCX · decisions page]
    end

    PDF --> X --> F --> D --> R --> M
    D -. issues .-> M
    A -- confirms --> C
    C -- prompt --> X
    C -- rules --> D
```

The **production path** runs left to right: PDF, extractor, stated facts, derivation, rows, minutes. **Per-body conventions** are an input to both the extractor and the derivation, written or confirmed by a person.

### Extractor (opencouncil-tasks)

`pollDecisions` reads each matched PDF and returns the roll call, the arrivals and departures with the anchor the document pins them to (an agenda item, a decision number, a phase of the session), the vote phrase as printed, the voters the page names, and the document's own present list where the body prints one. Names are matched to person ids; unmatched names travel as strings. The task version on the wire says which of these a stored read carries. `docs/decision-extraction-eval.md` in opencouncil-tasks describes what it reads and how that is measured.

### Stated facts (opencouncil)

One place holds what the documents state, written by the poll callback in `src/lib/tasks/pollDecisions.ts`:

- **Per-document facts** — columns on `Decision` (the vote phrase, the mayor sentence, the declared item number, whether the read was incomplete, the unmatched names) plus `Decision.extraction`, the wire entry as received; the named votes, the printed tally, the per-decision present list and the presiding member are read from there. No vote outcome, tally or provenance is stored: all are views over the rows.

Each page's own roll call and its own stated arrivals and departures live inside that same `Decision.extraction`. They are not stored as meeting-wide facts: the derivation combines them (below) into the roll call and the events it writes as output.

### Derivation (opencouncil)

`src/lib/derivation/` turns stated facts into the resolved roll call, the resolved events and per-subject rows. It is pure and deterministic: `deriveMeetingFacts()` takes everything it needs as one input (`loadDerivationInput()` does the only database reads) and running it twice yields identical rows. Four steps:

1. **Resolve the session** (`resolveSession.ts`) — combine every stored page's own roll call, its own stated arrivals and departures, and its per-vote absences into one roll call and one set of events. The rule it combines them by depends on the body's conventions ([below](#rules-by-body-convention)).
2. **Place events** (`placeEvents.ts`) — each event's anchor becomes an index into the meeting's discussion order, the same transcript-derived order the minutes print. An anchor that matches nothing becomes an issue, not a row. One anchor has a fallback: a change during the out-of-agenda items, in a meeting with no out-of-agenda subject, takes effect before the first subject and raises `OUT_OF_AGENDA_PLACED_FIRST` (info).
3. **Replay attendance** (`replayAttendance.ts`) — start from the roll call, apply the placed events subject by subject. Where the body prints a per-decision present list, that list wins for its subject and resets the state from there on. A change it implies without a stated event is reported. A list that is evidently cut does not win. The reader loses the end of a list that runs past its window of pages (Argos 62ΟΒΩΨΔ-Ε7Π keeps 13 of 20 names). The evidence of a cut is a member that the list leaves out and that the page names with a vote. ΑΠΟΧΗ does not count. The page's own roll call and the replay must both have that member present. The subject then replays as a page with no list, from the roll call and the stated changes. It raises `LIST_CUT` (warning) once. A list that is only shorter than the replay is not evidence of a cut. A per-decision roll call that lists a member as present, where a range of decisions on another page puts that member out of the room, also wins, and raises `SOURCES_DISAGREE`.
4. **Derive votes** (`deriveVotes.ts`) — the named votes are `stated`. When the phrase permits it (unanimous, majority, or a counted phrase), every present member the page did not name gets FOR, marked `inferred`. A printed count that disagrees with the rows is reported. A named vote of a member who is absent on that subject stays, and raises `VOTE_BY_ABSENT_MEMBER` (warning): the vote or the absence is wrong. A page that says ΑΠΟΦΑΣΙΖΕΙ, read whole, with no vote phrase, no named voter and no count raises `NO_VOTE_RESULT` (error): the read lost the vote.

Where a fact is missing, unresolved or contradicted, the derivation returns an issue rather than guessing silently. The closed set of codes is `ISSUE_CODES` in `src/lib/derivation/types.ts`; the site that raises each one says why in its message. An issue that concerns one member (it carries a `personId`) names that member: the decisions page names the member from the city's people, and the scripts name the member from the roster (`issuePerson()` in `src/lib/derivation/issueText.ts`). A name that matched nobody (`UNMATCHED_NAME`) or two people (`NAME_MATCHED_TWICE`) has no person line, because the issue's own message prints the name. In audit mode the decisions page shows the worst issue of a subject on a line under its title. The line opens a row under the subject that lists every issue of that subject, grouped by code. The issues card in the rail states each issue of the whole meeting in full. It shows one line per code for the issues of subjects, and that line opens the first subject that has the code. The derivation dialog also explains the two notes that the line shows when a subject has no issue. Issues are not stored: the decisions page recomputes them on read (`explainMeeting()`).

`deriveAndPersist()` runs at these times:

- At the end of each poll callback that returns readings (`handlePollDecisionsResult()`).
- After an edit of a reading commits: a link that replaces a document, an unlink, a reset, or a candidate that moves to another subject (`src/lib/derivation/rederive.ts`).
- After a person confirms or starts a body's conventions record, for every meeting of that body (`rederiveMeetingsOfBody()`). The route schedules the work with `after()`, so the response does not wait. It reads no page ([below](#a-body-with-no-record)).
- When a superadmin clicks «Επανυπολογισμός» on the decisions page. The button is the `rederive` action of the meeting decisions route. It rewrites the rows without a poll. The button shows only in audit mode, because nothing else runs the derivation after a change to the people or to the transcript.

A failure in the first three cases is logged, not thrown: the edit stands, and the rows keep their last snapshot.

Two codes pass on a warning that the reader stored with the page in `Decision.extraction.warnings`. `CLOSING_BLOCK_CUT` (warning) says that the member list or the signatures continue past the pages that the reader read, so the page's list and votes can be incomplete. `CLOSING_READ_FAILED` (warning) says that the reader could not read the pages after the decision, so the votes, the members and the number that they print can be missing. Each is raised once for the page's subject.

The write replaces every `decision`-sourced `MeetingAttendance`, `AttendanceEvent`, `SubjectAttendance` and `SubjectVote` row of the meeting at once, in one transaction. `MeetingAttendance` and `AttendanceEvent` rows of source `decision` are derivation output, never read back; rows of any other source are stated facts and outrank the pages. The derivation therefore refuses an input that would empty the rows: a document read before facts were stored, or no roll call at all. `derivationSkipIssue()` in `persist.ts` says why, and the stored rows stand. Because this check runs first, the replay never receives an empty roll call, and only the write step raises `NO_ROLL_CALL`.

### Conventions (both repos)

`AdministrativeBody.decisionConventions` records how one body writes its documents: the roll-call layout, whether the present list is the opening roll call or already includes late arrivals, what changes are anchored to, whether each decision prints its own present list. The shape is `DecisionConventions` in `src/lib/decisionConventions.ts`; the glossary for every value lives under `messages/<locale>/admin.json → conventions` — the `el` text for the admin form, the `en` sentences opencouncil renders into the poll request for the extractor's prompt.

A person writes or confirms the record in the administrative body form, which sets `provenance.source = 'manual'`. The records in `fixtures/body-conventions.json` came from a survey of each body's documents. Five of them still carry `provenance.source = 'profile'`, because no person has confirmed them. The derivation reads the record to decide what the present list means and whether a per-decision list is expected. It raises `CONVENTIONS_UNCONFIRMED` on every meeting of a body whose record says `profile`. A body with no record gets no extraction ([below](#a-body-with-no-record)).

#### Where a body's rules live

Two places, each with one job:

| what | where | who changes it |
| --- | --- | --- |
| **The record a body starts from** — one settled record per body, in the stored shape | opencouncil, `fixtures/body-conventions.json` | a page read that corrects it; edit the file |
| **The record in force** | the database, `AdministrativeBody.decisionConventions` | a person confirming it in the administrative body form |

The first one is in this repository because everything that gives it meaning is here too. That is the schema that validates it, the derivation that reads it, and the seed that needs it. A test parses every record against `decisionConventionsSchema`, so the file and the shape cannot drift apart unnoticed.

`scripts/import-body-conventions.ts` writes the file to the database in `DATABASE_URL`. It is idempotent, reports bodies the database does not hold, and **never overwrites a body a person has confirmed** — the file is a starting state, not an authority over admin. How it reaches each environment:

- **Local and preview databases**: `prisma/seed.ts` runs the same import after it creates the bodies, so a fresh database has conventions with no extra step. The seed imports the JSON rather than reading it from disk, because the preview runs an esbuild bundle of the seed with no `fixtures/` beside it.
- **Staging and production**: run `npx tsx scripts/import-body-conventions.ts` once after the migration that adds the column, and again whenever the file changes. A seed dump taken afterwards carries the conventions too.
- **Deploy order on production**: run the import **before** you deploy the opencouncil-tasks reader that takes the conventions. The migration has no backfill, and production runs no seed. A page that the task server reads without the hints keeps that reading, because the hints are part of the task's cache key.

#### A body with no record

A body with no conventions record gets no extraction. The poll sends `extract: false` (`src/lib/tasks/pollDecisions.ts`), so the task server only matches and links the body's decisions. It reads no page. A linked page with no usable reading keeps `needsExtraction`, so the next poll reads it with the hints. The scheduled poll (`pollDecisionsForRecentMeetings()`) selects only a meeting that has a subject with no linked decision. It therefore never returns to a meeting that was fully linked while the body had no record. After a person confirms the record, poll the body's meetings from their decisions page to read those pages. Confirming the record only derives the body's meetings again. The administrative body form offers an empty record to fill for such a body.

opencouncil-tasks must honour `extract`. A task server that does not know the field reads the pages without hints. A reading made that way derives with no conventions: the roll call replays as an opening roll call (`replayAttendance.ts`). `PRESENCE_UNKNOWN` marks each subject only in a meeting that states an arrival. `CONVENTIONS_UNCONFIRMED` does not fire, because no record exists to confirm.

A meeting also shows nothing until it has been polled under task v4, since attendance and votes derive from stored readings.

### Rules by body convention

Two questions about a body's documents, each answered by its own field of `DecisionConventions`:

| question | field | values |
| --- | --- | --- |
| Which moment does the top-of-page list describe? | `presentListMeaning` | `opening` — the start, the same on every page. `cumulative` — everyone who attended, late arrivals included, the same on every page. `per_decision` — the state at this page's own decision; it changes from page to page. `unknown` — not settled. |
| How does a page state a change? | `statesPerVoteAbsence`, `statesPerDecisionAttendance` | A sentence anchors a per-vote absence («αποχώρησε…»). A second list, ΤΑ ΜΕΛΗ, printed after the decision, states `statesPerDecisionAttendance`. |

`resolveSession.ts` combines every page's own roll call and events into one, by these rules:

- **Opening roll call.** For an `opening`, `cumulative` or `unknown` body: the roll call that more than half of the pages with a roll call print. A majority settles a misread. For a `per_decision` body: the roll call of the first page in the derivation's subject order. Either way, each page's own roll call still sets its own subject.
- **Session changes, a body whose pages carry their own list** (`per_decision`, or `statesPerDecisionAttendance` when at least one usable page of the meeting prints its list): every stated change counts, restatements merge, and a later page's list is checked against it.
- **Session changes, every other body:** the majority of pages decide, as the pre-C1 task did. A change needs more than half of the pages. A change that half of the pages or fewer state raises `CHANGE_NOT_CORROBORATED`.
- **A change pinned to the page's own subject** («προσήλθε κατά τη συζήτηση του θέματος»): always counts, on its own page, never voted.
- **A per-vote absence** («απουσίαζε κατά την ψηφοφορία», «Εκτός αιθούσης στις με αρ. 31 – 40»): the reader returns it as its own kind, `absent_for_vote`. It names the page's own decision, or a range of decision numbers. A reading stored before that kind holds a departure before and an arrival after the page's own subject, and `pageStatementsOf()` reads that pair as the same absence. The resolver combines the absences of every page and never takes a vote on them:
  - **Runs.** The absences of one member on consecutive subjects of the derivation's order are one run. A run gives one departure before its first subject and one arrival before the next subject whose usable page does not state the absence. A run that reaches the last subject has no arrival.
  - **Gaps.** A subject with no usable page (no page, or a reading before task v4) states nothing, so it does not end a run.
  - **Ranges.** A range covers every subject whose decision number is in the range, and a subject with no decision number between two of those. A subject with a decision number outside the range is not covered, even when the discussion order puts it between two decisions of the range. Its usable page ends the run, and the range starts a new run after it. A run that reaches the end of a range ends after the range's last decision. When the range's last decision is not linked yet, the run continues across the subjects with no decision number and no usable page, and ends at the next subject with a decision number or a usable page. When the range's first decision is not linked yet, the run starts in the same way: after the last subject before the range that has a decision number or a usable page. A range thus starts and ends at decision numbers, and a missing page is not evidence of a departure or a return. A boundary that a range states is anchored at its decision number when that number places the event at the same subject; every other boundary is anchored at the subject.
  - **A range outside the meeting.** A range that covers no numbered subject gives no event, and raises `UNPLACEABLE_ANCHOR` once per member and range. The reason is `rangeNotInMeeting`, or `rangeNoDecisionNumbers` when no subject of the meeting has a decision number, or `rangeNumberNoDigits` when a number of the range has no digits. The message names the whole range, because neither the departure nor the arrival is placed. This happens during a partial poll, before the range's decisions are linked. The next derivation after they are linked places the range.
  - **Restatements.** A page that states the absence of a decision in a run again joins that run. The run's events count every page that states it.

Four page checks catch what these rules cannot settle from one page alone:

- `LATE_ARRIVAL_IN_OPENING_LIST` — an `opening` body's page lists a member under ΠΑΡΟΝΤΕΣ that the same page also says arrived later.
- `NAMED_VOTERS_UNEXPECTED` — a page names voters unlike its body's convention: FOR on a body that names only dissenters, anyone on a body that names nobody, or nobody FOR on a body that names everyone under a phrase that carried. A body that names everyone only on a split vote (`all_when_split`) also expects nobody under «Ομόφωνα» and everyone under «κατά πλειοψηφία». A unanimous page that names every member present on the subject (the mayor excluded), all with one vote, is a unanimous rejection and raises nothing. A unanimous page that names only some of them, with nobody FOR, lost the FOR names and raises the issue.
- `NAMES_SHARE_ID` — two entries of one list on one page matched to the same person; one match is wrong.
- `NAME_MATCHED_TWICE` — one printed name matched to two different people on two pages of the same meeting.

The mayor: never a member of a council or a community; a member of a committee only with an active role on it.

### Tools

`npm run decisions -- reread-count` counts the linked pages that the next polls will read again, because they have no usable reading. It only reads. Run it before a deploy for the cost of the first polls.

The quality tooling (the meeting checker with its claims fixture, the measure over every meeting with readings, and the per-meeting traces) comes in a follow-up pull request.

## Key design decisions

### Per-subject attendance is derived, not stated
Members arrive late and leave early, and documents say so ("ο X αποχώρησε κατά τη συζήτηση του θέματος Y"), so attendance is modelled per subject. But no document states per-subject attendance for a whole meeting. Each states the roll call and the changes, and the derivation replays them along the discussion order. Storing the replayed result as a fact would freeze one reading of the events and hide where it came from.

### Votes: stated and inferred are different things
Pages name dissenters and declarers and almost never the majority. A FOR the page did not print is therefore not a read fact. The extractor never invents one, and the derivation adds it only from presence, marked `inferred`. Before task version 4 the task server did this inference itself and the app wrote the result as-is. Moving it behind stored facts is what lets it be re-run, explained and checked.

### The mayor
The mayor is never in the member lists or the changes block of the minutes. The ΔΗΜΑΡΧΟΣ line carries a note instead. It is built from their roll-call row, their own arrivals and departures, and whoever the documents say presided in their place. Whether the mayor gets attendance and vote rows depends on the body. On a council they attend without a vote and are left out. On a committee they sit on they vote like everyone else (`mayorIsMemberOf()` in `src/lib/utils/roles.ts`). Documents of one meeting that disagree about who presided raise an issue.

### Transcript content in minutes
Minutes include the utterances the summarize task linked to each subject via `Utterance.discussionSubjectId`, procedural vote ones included. Utterances outside every subject (preamble, epilogue, gaps) are handled by the temporal windows in `src/lib/minutes/temporalWindows.ts`.

This linking is AI-driven with no manual editing UI. Misclassified or unlinked utterances silently disappear from the minutes output.

### Discussion order and sections
The minutes, the decisions page and the derivation use one order of the subjects: `orderedMinutesSubjects()` with `discussionOrderKeys()` in `src/lib/minutes/builders.ts`. An anchor such as «after item 3» is placed by position, so a second order would put a change on a different subject. `minutesSections()` adds the temporal windows and the assignment of every utterance. `getMinutesData()` calls it.

- A subject's discussion is one or more spans (`discussionSpans()` in `src/lib/minutes/temporalWindows.ts`). A span splits where another subject has a VOTE utterance between two utterances of the subject: the council left the subject pending and decided something else.
- A procedural vote of the subject that follows a span, before an utterance of another subject, closes that span. The vote to postpone a subject ends the span that it postpones. These votes do not change where a span starts or splits.
- A subject sorts at the start of its first span. The whole transcript therefore reads in time order. On Sparta may6_2026, item 5 prints after item 4.
- The first span is the subject's section. A later span prints where it happened, inside the section that was discussed before it, between the lines «[ Σχετικά με: «…» ]» and «[ Συνέχεια συζήτησης ]». The subject's own section names that section («Μέρος της συζήτησης πραγματοποιήθηκε κατά τη συζήτηση …»). On Sparta may6_2026, the resumed discussion and the vote of item 5 print at the end of item 14.
- The derivation uses the same order. A subject left pending therefore takes its attendance and its inferred votes at the position where its discussion started, not where it was voted. A page that states presence «στα θέματα 10-14 και 5» does not match that position.
- The poll's request to the task orders the subjects by their first utterance of any status. No derived row depends on that order.

### Subject headings print the official agenda title
`Subject.agendaItemTitle` holds the item as written on the official agenda. `processAgenda` fills it for new meetings. The minutes print it in the table of contents, in each subject heading, and in cross-references. A subject without a title, for example one that summarize created, prints its summary name instead; `agendaItemTitleOrName()` in `src/lib/utils/subjects.ts` holds that rule. Web pages keep showing the summary name. The Diavgeia decision matcher receives the same title as the subject text of the poll request: the official wording matches decision titles far better than the summary name (issue #616).

### Excerpt and references are markdown
`Decision.excerpt` and `Decision.references` are stored as markdown to preserve PDF structure (bullet points, numbered lists, tables). Richness varies by municipality — Vrilissia has 14+ numbered reference items per decision, while Zografou often uses a single generic phrase.

### Dual creation pattern
`Decision`, `MeetingAttendance`, `SubjectAttendance` and `SubjectVote` rows can be created automatically (tracked by `taskId`) or manually (tracked by `createdById`), and carry a `source`. The derivation only ever replaces `decision`-sourced rows, so manual rows survive a re-derive. `SOURCE_PRECEDENCE` in `src/lib/derivation/types.ts` says which source wins when two state different values for one fact; note its comment — the readers that feed the page do not yet apply it, and nothing writes a manual row today.
