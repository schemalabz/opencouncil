# Plan 002: Give each speaker contribution a shareable page and preview

> Follow this plan in order and update its status in `plans/README.md` when finished.
>
> Drift check: `git diff --stat 743e50337..HEAD -- src/components/meetings/subject src/components/FormattedTextDisplay.tsx src/lib/sharing src/components/sharing src/components/og messages`
> Changes delivered by plan 001 are expected. Read its actual exports before extending them. Resolve incompatible changes to the cited source before proceeding.

## Status

- Priority: P1
- Effort: M
- Risk: MED — the page must preserve attribution and source references without loading the full meeting context.
- Depends on: plan 001's public-content resolver and reusable share dialog
- Category: direction
- Planned at: commit `743e50337`, 2026-09-10
- Completed and reviewed: 2026-09-11 on `codex/sharing-features`, rebased onto `6e951634c`. See [final review](README.md#final-review--2026-09-11) for accepted adjustments and verification limits.

## Why this matters

Readers should be able to share what one speaker contributed to a subject directly from that contribution. A recipient should immediately see the speaker, the subject, and the complete summary, with access to the supporting transcript.

## Product contract

- Add **Share contribution** to every contribution card on both subject pages and person pages.
- Keep this action available when there is no playback timestamp or matched person record. Those conditions should affect playback and attribution fallbacks, not sharing.
- A unique URL renders the contribution prominently with speaker name/photo when available, subject, municipality, meeting date, and the existing AI-summary label.
- The OG preview shows the same speaker and a bounded summary excerpt. It must not put an AI summary inside quotation marks or describe it as verbatim speech.
- The recipient can read the full summary, open its valid source references, and open the complete subject. A **Listen from here** link is available only when a public source range exists.
- The dialog offers copy link, copy summary with source, and native sharing. Reuse the dialog behavior from plan 001, including clipboard failure and native-share cancellation handling.

These are links to the current contribution summary, not immutable historical snapshots. A deleted or regenerated contribution returns an unavailable state. Do not guess a replacement speaker or subject. Publishing video, editing summaries, historical snapshots, and public vote sharing are out of scope.

## Current state

- `src/components/meetings/subject/ContributionCard.tsx` is shared by subject and person pages. `contextHeader` adds the subject/meeting header for person pages. `showPlayButton` is false outside a `VideoProvider`.
- Its timestamp fetch is keyed by `contribution.speakerId`. The action group at lines 134-166 is inside `{utteranceInfo && (...)}`. Do not put the new share action inside that condition.
- Its summary uses:

  ```tsx
  <FormattedTextDisplay
      text={contribution.text}
      meetingId={meeting.id}
      cityId={meeting.cityId}
      linkColor="black"
      disableUtteranceExpansion={!!contextHeader}
  />
  // AIGeneratedBadge follows the summary.
  ```

- `src/components/meetings/subject/subject.tsx:444-452` renders contributions by `contribution.id` but does not expose a stable DOM target:

  ```tsx
  {contributions.map((contribution, index) => (
      <div key={contribution.id}>
          <ContributionCard contribution={contribution} subjectId={subject.id}
              meeting={meeting} speaker={contribution.speakerId ? getPerson(contribution.speakerId) ?? null : null} />
      </div>
  ))}
  ```

- `prisma/schema.prisma` defines `SpeakerContribution` with `id`, `text`, `subjectId`, nullable `speakerId`, nullable `speakerName`, and `order`. `text` is markdown with `REF:TYPE:ID` links. This schema already supports the feature; no migration is needed.
- `FormattedTextDisplay.tsx` currently turns utterance references into non-clickable spans when `disableUtteranceExpansion` is true. Simply setting that prop on a new standalone page would lose the source links.
- `UtteranceReferenceLink.tsx` requires both `CouncilMeetingDataContext` and `UtteranceExpansionContext`. Do not mount it on a lightweight share page without those providers.
- The existing first-utterance route reads discussion-tagged utterances by subject and speaker. It does not enforce all the public-share visibility rules. Use a lean server query through the new public resolver instead of calling that route from OG generation.
- `getSubject()` in `src/lib/db/subject.ts` includes private relations and does not itself require a released meeting. Do not use it as the new share endpoint's access boundary.

## Architecture and conventions

Proposed routes:

- `src/app/[locale]/(sharing)/share/contribution/[contributionId]/page.tsx`
- `src/app/[locale]/(sharing)/share/contribution/[contributionId]/opengraph-image.tsx`

Use `src/lib/sharing/contributions.ts`, a `server-only` resolver. It loads only the contribution, public subject/meeting context, speaker display fields, and bounded reference metadata. Enforce `meeting.released: true` and the requested realm even when the viewer is signed in as an editor. Do not use auth-sensitive `getMeetingDataCached` or fetch a full transcript.

Plan 001 introduces `publicContent.ts` for lean meeting/subject lookups and `ContentShareDialog.tsx` for copy/native sharing. Inspect and reuse their actual interfaces. The shared query layer accepts an explicit realm and has no implicit editor override.

The contribution summary remains public under the existing subject visibility rules. Transcript references and playback timestamps additionally honor the transcript-review visibility rule. If the transcript is hidden, show the summary and subject link, but omit transcript access and its text/timestamps from page and metadata.

Resolve all `REF:UTTERANCE` identifiers for the displayed contribution in one bounded batch. Verify each belongs to the contribution's meeting. Do not fetch neighboring transcript prose just to construct links. Build explicit locale-aware transcript links from validated timestamps, rather than a referer-dependent redirect. Invalid references render as text. If an unexpected number of references exceeds the chosen documented bound (use 100 in v1), leave excess references as text and retain the full subject link.

Extend `FormattedTextDisplay` with an explicit optional map of prevalidated utterance links for standalone rendering. Existing expansion behavior and person-page behavior remain unchanged when the map is absent. The renderer must not accept arbitrary raw HTML. Validate href protocols for ordinary external links while touching this path; accept relative/same-site or HTTP(S) links, and keep internal REF handling separate.

Use `getLocalizedName`, `localizeText`, existing markdown-stripping helpers, and `formatDate` with the municipality timezone. Use `getMetadataBaseFromRequest()` for absolute OG URLs in previews and production. Use `OG_FONTS` and logo assets for the image. Keep reference identifiers byte-exact during Serbian transliteration.

The share page and its file-based OG image must be dynamically resolved and returned with private/no-store response headers. Explicitly configure dynamic image generation; do not assume that querying the database prevents a metadata image from being statically cached. Re-fetch both surfaces after a local meeting is unreleased and confirm that neither returns its summary or attribution. External social platforms may keep an earlier image in their own caches; OC cannot recall that image.

Add `id="contribution-{id}"` on the subject's contribution wrapper. The share page's full-subject link uses that anchor. Confirm scroll behavior after client rendering and under the sticky meeting header; add a small target adapter only if native anchor navigation does not reliably land there.

## Scope

New files:

- `src/lib/sharing/contributions.ts` and `src/lib/sharing/__tests__/contributions.test.ts`
- `src/components/sharing/{ContributionShareButton,SharedContribution}.tsx` and tests under `src/components/sharing/__tests__/`
- `src/components/og/ContributionOgImage.tsx` and its test under `src/components/og/__tests__/`
- The two routes above and their colocated tests
- `src/components/meetings/subject/__tests__/ContributionCard.test.tsx`

Existing files allowed: `src/lib/sharing/publicContent.ts` and `src/lib/sharing/__tests__/publicContent.test.ts`, `src/components/sharing/ContentShareDialog.tsx` and its test, `src/components/meetings/subject/{ContributionCard,subject}.tsx`, `src/components/FormattedTextDisplay.tsx` and tests at `src/components/__tests__/FormattedTextDisplay.test.tsx` (create if absent), `next.config.mjs` only for narrowly scoped share/image response headers, `messages/{el,en,fr,sr}/sharing.json`, `docs/guides/sharing.md`, and `plans/README.md`.

Out of scope: Prisma schema, contribution generation, person-page layout redesign, existing first-utterance API redesign, transcript editing, embed configuration, and public voting policy.

## Commands

Use the repository's Node 24/npm environment. Read `CLAUDE.md` and `CONTRIBUTING.md`. No production data access is necessary.

| Purpose | Command | Success |
|---|---|---|
| Typecheck | `npx tsc --noEmit --incremental false` | Exit 0 or documented unchanged baseline errors |
| Focused tests | `npm test -- --runInBand --testPathPatterns='sharing|Contribution|FormattedTextDisplay|UtteranceReferenceLink'` | All selected suites pass |
| Catalog checks | `npm test -- --runInBand --runTestsByPath src/lib/__tests__/sr-latn-catalog.test.ts` | All pass |
| Lint | `npm run lint -- --quiet` | No new errors |
| Build | `npm run build` | Completes in safe local configuration |

The existing `UtteranceReferenceLink` test passed during planning. The new feature tests do not exist yet. Do not claim a complete baseline build/typecheck was run.

## Steps and verification

### 1. Add the public contribution resolver

Implement `getPublicContribution` with type-safe Prisma selects and shared public visibility checks. Return a render model with summary, speaker fallback, context, validated source links, and optional public playback start. Use at most a fixed number of queries, including one reference batch.

Verify: `npm test -- --runInBand --testPathPatterns='contributions|publicContent'` → release/realm/missing-ID/reference cases pass. Follow the mock structure in `src/lib/__tests__/meetingSummary.test.ts` and assert query scope and selected fields.

### 2. Preserve references on the standalone page

Add the optional validated-reference map to `FormattedTextDisplay`. Create `SharedContribution` without meeting/video providers. Keep markdown paragraphs, speaker attribution, and the AI label. Invalid/unavailable references remain readable text.

Verify: `npm test -- --runInBand --testPathPatterns='SharedContribution|FormattedTextDisplay|UtteranceReferenceLink'` → valid references navigate, invalid references do not, and existing expandable transcript references still work.

### 3. Add the page, metadata, and image

Create both routes. The shared page and image resolve the same public data. Set noindex on the duplicate share view. Render the complete summary on the page and a clearly abbreviated summary preview in the OG image. Missing names/photos use consistent fallbacks. Prevent quote marks or transcript-excerpt labels from implying that the summary is verbatim.

Verify: `npm test -- --runInBand --testPathPatterns='Contribution|contributions'` → route and image model tests pass, contribution IDs yield different URLs, and private/deleted records produce no content-bearing metadata. `npx tsc --noEmit --incremental false` → no new errors.

### 4. Connect both entry points and the subject anchor

Add a share button outside the timestamp-only action group. Pass the contribution ID and context directly; do not derive the target from the current window URL. Use the shared dialog and keep navigation/play actions intact. Add the full-subject anchor.

Verify: `npm test -- --runInBand --testPathPatterns='ContributionShareButton|ContributionCard|ContentShareDialog'` → subject and person-page cards share the same contribution URL, including cards with no speaker ID or timestamp. Tests must render the person-page variant without `VideoProvider`.

### 5. Complete visual and recipient verification

Run all commands above. Check an anonymous recipient, a long Greek summary, no photo, an unidentified speaker, missing transcript references, a hidden unreviewed transcript, and a deleted contribution. Confirm the full-subject link lands on the correct contribution under the sticky header.

Request the share URL as a bot and verify that metadata exists in the server response. Fetch and visually inspect the actual 1200×630 OG image, including Greek accents and the summary label. Verify private/no-store response headers on the page and the image. Unrelease a local fixture meeting and re-fetch both URLs; neither may return its summary or attribution. Record these checks in `docs/guides/sharing.md` and the implementation report.

## Done criteria and STOP conditions

- [x] Both card contexts expose a working share action without requiring a timestamp or video provider.
- [x] The focused tests verify attribution, public-only data, references, deep linking, and clipboard outcomes.
- [x] Page metadata and OG tests use the same public contribution ID and content model.
- [x] Page and image generation are dynamic/no-store, with a verified local unrelease/re-fetch check.
- [x] The new standalone rendering passes the existing reference regression suite.
- [x] Typecheck, catalog, lint, and build results are recorded with any unchanged baseline failures.
- [x] No schema or task-generation change appears in `git diff --name-only`.
- [x] Actual share-page and OG image visual checks are recorded.
- [x] `plans/README.md` is updated.

Use `codex/share-speaker-contributions` if creating a branch and Conventional Commits such as `feat(sharing): share speaker contributions`. Do not push or publish merely because this plan exists.

Report an incompatible dependency contract, a need to expose hidden transcript text, or a requirement for historical summary snapshots before expanding scope. Resolve routine failures normally; report a remaining failure after two reasonable attempts.

## Maintenance notes

Summarization can regenerate contribution IDs. Speaker corrections and regenerated summaries change the current shared content. Keep the AI label visible and the unavailable state explicit. Any future reference renderer must preserve the difference between standalone links and provider-backed inline expansion.
