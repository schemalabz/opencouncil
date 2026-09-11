# Sharing implementation plans

Prepared on 2026-09-10 against commit `743e50337` using the improve skill.

The selected features are transcript excerpts, speaker contributions, and public subject embeds. The initial implementation and user-requested refinements are complete in `/private/tmp/oc-sharing-features` on `codex/sharing-features`. The branch was rebased onto `origin/main` at `6e951634c` before final validation. Current main’s design takes precedence over the original design notes.

## Execution order

| Plan | Result | Priority | Effort | Depends on | Status |
|---|---|---|---|---|---|
| [001](001-transcript-excerpts.md) | Whole transcript utterances have a share page, an accurate OG preview, and source links | P1 | L | — | DONE |
| [002](002-contribution-sharing.md) | A shared contribution opens highlighted within its subject, with its own OG preview | P1 | M | 001 public-data and share-dialog infrastructure | DONE |
| [003](003-public-subject-embeds.md) | Any reader can preview and copy an iframe for one public subject | P1 | M | 001 public-data infrastructure | DONE |

Effort is relative, including verification. Excerpts have the most complexity because browser selection, multiple speakers, source corrections, and social previews must agree.

## Product scope

- Excerpts: share saved text in read mode or edit mode, select a continuous passage, preview it, copy its link or copy the quote with attribution, and use native sharing where supported. Recipients see the complete selected utterances prominently, surrounding text, and a link to the recording.
- Contributions: share a speaker's existing AI-generated contribution summary from both the subject page and the person page. Keep the summary label and its references.
- Embeds: add a public **Embed this subject** action to subject sharing. Render one subject in the existing widget style. Do not open the administrative widget configurator to everyone.

The proposed first version uses source references in excerpt URLs, with a digest that detects changes to the selected text or speaker attribution. It does not store a second copy of every quote. If the source changes, an old link shows an explicit unavailable/changed state and links to the meeting. It must never silently quote different words. Permanent historical quote snapshots and remapping links after full transcript regeneration are deferred; they need a separate data-retention design.

Contribution links resolve the current summary. They are not historical snapshots. Deleted or regenerated contribution IDs have an unavailable state.

## Shared contracts and ordering

Plan 001 introduces a small public-only data access module and reusable share dialog. Plan 002 extends them. Plan 003 reuses only the public meeting/subject lookup and existing embed components. Keep subject embeds independent of excerpt storage or transcript loading.

All new public surfaces must enforce released-meeting access even when the requester is an editor. Excerpts additionally enforce the existing transcript review visibility rule. Page content, metadata, and OG image endpoints use the same eligibility rules.

Every plan includes its own context, scope, verification commands, and acceptance criteria. An executor must read the complete selected plan and verify its drift check before writing code. A change to a dependency is expected drift: reconcile its actual exported contracts before continuing.

## Baseline verification

Executed on 2026-09-10:

```sh
npm test -- --runInBand --runTestsByPath src/lib/utils/__tests__/embedBaseUrl.test.ts src/lib/utils/__tests__/embedParams.test.ts src/components/embed/__tests__/EmbedMeetingSummary.test.tsx src/components/meetings/subject/__tests__/UtteranceReferenceLink.test.tsx
```

Result: **4 suites, 14 tests passed**. Existing warnings concern Jest project options, deprecated ts-jest configuration, and duplicate manual mocks in nested `.claude/worktrees`. Do not change test configuration or delete those worktrees as part of sharing work. No application build, full typecheck, full test suite, database query, or browser interaction was performed during planning.

## Deferred features

- Subject/outcome export cards, video clip publication, neighborhood roundups: not selected for this batch.
- Excerpt and contribution iframe variants, an embedded video player, and automatic iframe resizing: possible extensions after the single-subject embed.
- Public voting cards: voting has a separate visibility policy and is not part of this work.
- A general redesign of the sharing menu or widget configurator: keep existing workflows intact.

The survey covered the selected sharing paths, their data access, localization, and representative tests. It was not a general security or performance audit.

## Final review — 2026-09-11

Approved on `codex/sharing-features` after rebasing onto `origin/main` at `6e951634c` (remote head rechecked before completion). Current main's rounded surfaces, typography and charcoal controls were preserved.

- Full unit suite: 186 suites and 2,235 tests passed, one existing skip.
- TypeScript, ESLint, Serbian catalog validation, and the production build passed.
- Desktop and 390px mobile browser checks covered selection, recipient pages, exact source highlighting, saved-text sharing in edit mode, contribution sharing and subject embed preview/copy.
- Actual Greek single-speaker and multi-speaker OG PNGs rendered correctly.
- Production HTTP checks against an isolated local PostgreSQL fixture verified valid content, source-change recovery, unpublished-content suppression and private/no-store headers.
- A subject iframe rendered in a local article on a different origin, including the dark background and narrow-width scrolling; `frame-ancestors *` was verified.

Accepted implementation adjustments: Prisma resolvers live in `src/lib/db/sharing` to satisfy the current repository boundary rule; sharing modules re-export their interfaces. Shared quote, page-shell and OG components avoid duplication. Route coverage is consolidated under sharing tests. Current `realmBaseUrl` replaces the removed pre-rebase utility. No dependency, schema, generation, admin-configurator or global access-policy changes were needed.

Validation used fictional local data. Docker integration tests, real touch devices and actual audio playback were not exercised. Native PostgreSQL fixture geometry values were null; GIS behavior was not tested. The preview is local, and the feature branch is ready for review and merge.

## User-requested refinements — 2026-09-11

This request supersedes the initial excerpt and contribution interaction contracts:

- Share complete utterances only. Native partial selections expand to whole intersected utterances; links carry no character offsets. Existing offset-based links are rejected to avoid silently changing what was shared.
- Use clear **Copy link** and **Share** actions, with **Copy text with source** below them as a quiet action. Keep technical link fields out of the normal flow.
- Apply the existing orange tokens to sharing actions and source emphasis while preserving current main's restrained styling.
- Contribution links open the full subject with the selected contribution highlighted and scrolled into view. The subject URL still has contribution-specific metadata; legacy contribution routes redirect there.

Whole-utterance digests use version 2, and source queries remain bounded to 40 utterances and 20,000 characters. Metadata previews remain bounded; recipient pages and copied text retain the full selected utterances.

Refinements approved after validation:

- Full Jest suite: 186 suites, 2,245 tests passed and one existing skip. After the final metadata-only change, all 10 affected suites and 49 tests passed.
- TypeScript, ESLint, Serbian catalog validation and production build passed. A clean build resolved a cached local compiler-worker permissions failure; no source workaround was needed.
- Desktop and 390px mobile browser checks verified the simplified action hierarchy, complete Greek labels, no horizontal overflow, full-utterance source marking and exactly one highlighted contribution within its subject.
- Automated selection tests cover partial drags expanding to complete utterances and excluding synthetic separators. Saved-text sharing in edit mode remains supported; its end-to-end browser check was completed in the initial review.
- Production HTTP checks against the isolated local PostgreSQL fixture verified full utterance content, offset rejection, subject contribution metadata, legacy redirects, source-correction invalidation, unpublished-content suppression and private/no-store headers.
- Both updated OG endpoints returned 1200×630 PNGs; the whole-utterance quote image was visually checked. Canonical production metadata URLs were resolved against the local preview for fixture testing.

All temporary fixture edits were restored. The existing validation limitations above still apply. The production preview remains on port 3101.
