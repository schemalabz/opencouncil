# Plan 001: Share selected transcript passages with matching previews

> Follow the steps in order. Verify each step before continuing. Update this plan's status in `plans/README.md` when finished. This plan describes a proposed first implementation; it does not authorize deployment or publishing messages to external services.
>
> Drift check: `git diff --stat 743e50337..HEAD -- src/components/meetings/transcript src/components/meetings/VideoProvider.tsx src/contexts/ShareContext.tsx src/lib/db/transcript.ts src/lib/getMeetingData.ts src/lib/sharing src/components/sharing src/components/og next.config.mjs src/proxy.ts messages`
> Compare changed source against the excerpts below. Reconcile expected changes; report incompatible behavior before implementing.

## Status

- Priority: P1
- Effort: L
- Risk: MED — incorrect selection offsets or inconsistent public access could produce an inaccurate preview.
- Depends on: none
- Category: direction
- Planned at: commit `743e50337`, 2026-09-10
- Completed and reviewed: 2026-09-11 on `codex/sharing-features`, rebased onto `6e951634c`. See [final review](README.md#final-review--2026-09-11) for accepted adjustments and verification limits.

## Why this matters

A reader can currently copy selected words or copy a timestamp link. The link does not preserve the selected passage, and its social preview does not show that passage. This feature makes a passage understandable before and after someone opens the link.

## Product contract

1. Select a continuous passage in the public transcript. Show an accessible **Share excerpt** action near the selection, and an equivalent action in the existing context menu.
2. Open a preview dialog with the selected words, speaker attribution, municipality, meeting date, and subject when the selection has one unambiguous subject.
3. Offer **Copy link**, **Copy quote with source**, and native sharing when supported. Show successful copy feedback only after the clipboard promise resolves. Cancellation of native sharing is not an error.
4. The shared page displays the exact selected passage prominently, with a small amount of preceding/following source text. Attribute each speaker separately when a passage crosses speakers.
5. Provide **Listen from here** and **Read in full transcript** links. These open the existing transcript at the first selected utterance; the latter also highlights the selected character ranges. Do not autoplay on page arrival.
6. The OG image contains the selected passage, attribution, and context. The selection takes precedence over surrounding text. For passages too long for the image, show a visibly truncated preview with an ellipsis; the page contains the full selection.

V1 limits: one continuous range, at most 1,200 UTF-16 code units of selected transcript text and 40 utterances. Reject an oversized selection with guidance to shorten it; do not silently change it. Single utterances and multiple speakers are supported. Disjoint selections, edited quote text, rendered video, and image-download formats are out of scope.

## Current state and conventions

- `src/components/meetings/transcript/UtteranceContextMenu.tsx:88-95` captures `window.getSelection()?.toString()`. Its deferred share at lines 111-123 passes only a timestamp to `openShareDropdownAndCopy`.
- `src/components/meetings/transcript/Utterance.tsx:434-457` renders localized text with a trailing separator:

  ```tsx
  const displayText = options.editable && isEmptyUtterance
      ? '[Empty utterance - click to edit]'
      : localize(localUtterance.text) + ' ';
  // The read-only span carries these source identifiers:
  data-utterance-id={localUtterance.id}
  data-segment-id={localUtterance.speakerSegmentId}
  data-start-timestamp={localUtterance.startTimestamp}
  ```

- `Transcript.tsx` owns the transcript container and one shared context menu. Keep selection listeners at this level; do not add a document listener per utterance.
- `Utterance.tsx:108-148` seeks on a normal click. Finishing a drag selection must not trigger an unintended seek.
- `src/lib/getMeetingData.ts` derives `transcriptHiddenForReview` from `!taskStatus.humanReview && meeting.administrativeBody?.showUnreviewedTranscript === false`.
- `src/lib/db/tasks.ts:164-198` derives review completion from `type: 'humanReview'`, `status: 'succeeded'`. Query the same fact in the new lean public resolver.
- `src/lib/db/transcript.ts` retrieves raw transcript records without its own release check. `getMeetingDataCached` also allows editor views and loads a full transcript. Neither is the public-share data boundary.
- `src/lib/db/meetingSummary.ts` is the public-query pattern:

  ```ts
  import 'server-only';
  const meeting = await prisma.councilMeeting.findUnique({
      where: { cityId_id: { cityId, id: meetingId }, released: true },
      select: meetingSummarySelect,
  });
  ```

- Derive Prisma result types from a `satisfies Prisma.*Select` constant, following `src/lib/db/types/meetingSummary.ts`. Do not duplicate the entire meeting/transcript type.
- `src/lib/realm.server.ts` resolves the request realm; resolve it before any cache callback. Use `getMetadataBaseFromRequest()` for preview-aware absolute metadata URLs. Do not hardcode `opencouncil.gr`.
- `src/lib/og/serverAssets.ts` supplies `OG_FONTS` and logo data URIs. Existing OG components use `ImageResponse` and inline styles.
- `src/i18n/request.ts` auto-loads modular message JSON. Author `messages/{el,en,fr,sr}/sharing.json`; Serbian Latin is generated from Serbian Cyrillic, not a separate catalog.

## Architecture

Use a source-backed GET URL, not an anonymous database write. The query contains only bounded source selectors and a digest:

```ts
type ExcerptSelector = {
  cityId: string;
  meetingId: string;
  firstUtteranceId: string;
  lastUtteranceId: string;
  startOffset: number; // inclusive, in the first localized utterance
  endOffset: number;   // exclusive, in the last localized utterance
  textLocale: string;  // validated against supported locales
  digest: string;     // SHA-256 of canonical selected runs plus attribution
};
```

Keep the exact query keys in one serializer/parser. Offsets refer to `localizeText(utterance.text, textLocale)`, excluding the synthetic trailing space. This matters for Serbian transliteration, which can change text length. The source text locale remains fixed when someone changes the surrounding UI language.

The digest detects changes; it is not an authorization token. The server always reconstructs the selection and attribution from its own data. It must never use supplied free text, HTML, image URLs, speaker names, or subject names as the source for an image or quote.

Proposed routes:

- `src/app/[locale]/(sharing)/share/excerpt/page.tsx`: server-rendered, noindex share page using query selectors.
- `src/app/api/og/excerpt/route.tsx`: `ImageResponse` using the same selectors and resolver. The page explicitly sets `openGraph.images` and Twitter image metadata to this complete URL. A file-based OG image that ignores the page query is insufficient.
- The full-transcript link carries the selectors and `t` under the existing transcript route. Its URL locale is always `textLocale`, even if the recipient changed the share page's UI language. This makes the rendered transcript use the same script and offsets as the selection. A client range highlighter restores the exact matching passage after transcript rendering.

The new `src/lib/sharing/publicContent.ts` is a `server-only` module with lean public meeting/subject reads. It enforces meeting release and the request realm for share pages and image routes. Accept an explicit realm parameter so later public embed callers can choose the existing widget realm policy without reading request headers inside cache callbacks.

`src/lib/sharing/excerpts.ts` resolves selectors with bounded queries. Validate both endpoints belong to the same requested meeting and order. Use the same deterministic sequence as the rendered transcript: speaker segments by `(startTimestamp, id)`, then utterances within each segment by `(startTimestamp, id)`. If necessary, add ID tie-breakers to `getTranscript`; never reorder overlapping speaker segments into a different sequence only in the share service. Query at most 41 selected utterances to detect overflow and a bounded amount of adjacent context. Do not fetch the entire meeting transcript for OG rendering.

Return a discriminated result for valid, invalid, source-changed, and unavailable. A source edit or regenerated ID must not silently produce different quoted words. The share page shows a localized changed/unavailable state and a safe meeting link. The image route returns a neutral unavailable image without quote or attribution and disables caching of that response. An old preview cached by an external platform cannot be recalled by OC; document that limitation.

Do not put these new routes into a public response cache in v1. Request-local deduplication is sufficient. Confirm that `next.config.mjs` keeps share pages and image responses private/no-store so a newly hidden meeting does not remain available from an OC CDN cache.

## Scope

Allowed new paths:

- `src/lib/sharing/{publicContent,excerptSelector,excerpts}.ts`
- `src/lib/sharing/__tests__/{publicContent,excerptSelector,excerpts}.test.ts`
- `src/lib/sharing/selection.ts` and `src/lib/sharing/__tests__/selection.test.tsx`
- `src/components/sharing/{ContentShareDialog,ExcerptSelectionToolbar,SharedExcerpt,ExcerptRangeHighlight}.tsx` and their tests under `src/components/sharing/__tests__/`
- `src/components/og/ExcerptOgImage.tsx` and its tests under `src/components/og/__tests__/`
- The two routes above and tests colocated in their `__tests__` directories
- `messages/{el,en,fr,sr}/sharing.json`
- `docs/guides/sharing.md`

Allowed existing files: `src/components/meetings/transcript/{Transcript,Utterance,UtteranceContextMenu}.tsx`, `src/lib/db/transcript.ts` for deterministic ordering only, `src/contexts/ShareContext.tsx` if needed for dialog coordination, `next.config.mjs` for narrowly scoped response headers, and `plans/README.md`.

Out of scope: schema/migrations, task processing, recording generation, global access-policy changes, unrelated API fixes, native widget embeds, contribution sharing, social-network publishing, and new infrastructure dependencies.

## Commands and baseline

Run from the repository root with Node 24 and installed npm dependencies. `CLAUDE.md` and `CONTRIBUTING.md` apply. Do not query a production database; prepare local fixtures using the documented development setup.

| Purpose | Command | Success |
|---|---|---|
| Typecheck | `npx tsc --noEmit --incremental false` | Exit 0; compare any initial baseline failures before attributing them to this work |
| Tests | `npm test -- --runInBand --testPathPatterns='sharing|Excerpt|UtteranceReferenceLink'` | All selected suites pass |
| Localization | `npm test -- --runInBand --runTestsByPath src/lib/__tests__/sr-latn-catalog.test.ts` | Catalog checks pass |
| Lint | `npm run lint -- --quiet` | No errors; record pre-existing baseline failures separately |
| Build | `npm run build` | Completes using a safe local development configuration |

The existing `UtteranceReferenceLink` suite passed during planning. A complete typecheck/build baseline has not been run.

## Steps

### 1. Implement and test the selection contract

Create `excerptSelector.ts` for strict parsing, serialization, bounds, canonical selected runs, and digest comparison. Reject negative/fractional offsets, invalid locale, repeated ambiguous query keys, reversed ranges, empty text, and splitting a surrogate pair. Trim only synthetic separators; preserve meaningful text and punctuation.

Create `selection.ts` to capture a browser Range before opening a Radix dialog. Normalize backward selections. Traverse only transcript utterance text nodes, excluding speaker headers, buttons, timestamps, and text outside the transcript root. Derive the selected canonical runs from the transcript data, not untrusted DOM replacement text. Both range endpoints must map to real utterance content after boundary normalization.

Verify: `npm test -- --runInBand --testPathPatterns='excerptSelector|selection'` → all boundary, multi-node, Greek, emoji, and Serbian Latin cases pass.

### 2. Implement the bounded public resolver

Create the lean public selectors and data resolver. Validate city, meeting, realm, release, and transcript review eligibility before returning any text. Fetch selected rows and context with stable ordering and enforce the 40-utterance/1,200-code-unit limits. Load only the speaker and subject fields required for attribution. Return an unknown-speaker label when a person record is absent; do not invent identity. A selection covering multiple subjects uses meeting context instead of one arbitrary subject title.

Verify: `npm test -- --runInBand --testPathPatterns='publicContent|excerpts'` → valid selections resolve, cross-meeting endpoints fail, unavailable material is absent, and the database query count and row limits are bounded.

### 3. Build the share page and OG image

Implement the shared view, the server page, and the image route using one resolved content model. Reuse OC typography and OG font assets. Show separate speaker runs in a multi-speaker quote. Use a conservative deterministic image text budget and visible ellipses; do not shrink long text until it is unreadable. Metadata includes a complete absolute image URL carrying the normalized selection.

Verify: `npm test -- --runInBand --testPathPatterns='sharing|Excerpt|excerpt'` → page/metadata/image tests agree on text and eligibility, and two selections produce different image URLs. `npx tsc --noEmit --incremental false` → no new type errors.

### 4. Connect selection, clipboard, and recipient highlighting

Add one selection toolbar at the transcript-container level, an equivalent context-menu action, and the reusable `ContentShareDialog`. Suppress selection sharing in transcript editing and highlight editing modes. Keep the existing timestamp copy and plain copy-text actions.

Use document `selectionchange` plus bounded container measurements so touch selection and keyboard selection work. Retain the captured range while the dialog owns focus. The floating action must remain inside the viewport and must not replace the browser's native text selection behavior. Handle clipboard rejection with an error and selectable URL fallback. Feature-detect native sharing and ignore `AbortError`.

Render exact character highlighting in the full transcript through a single container-level adapter. Prefer the CSS Custom Highlight API when available. Supply a tested React mark-range fallback on the affected utterances; never assign transcript HTML through `innerHTML`. Verify the digest against displayed text before highlighting. Existing playback highlighting, edit selection, and `t=0` behavior must remain intact.

Verify: `npm test -- --runInBand --testPathPatterns='selection|ContentShareDialog|ExcerptRangeHighlight|UtteranceReferenceLink'` → actions preserve selection, clipboard errors do not report success, and only intended characters are highlighted.

### 5. Verify the complete recipient journey

Run the typecheck, scoped tests, localization tests, lint, and build above. In a safe development server, exercise mouse and keyboard selection and an actual touch-capable browser/device for long-press selection. Check one short Greek quote, a longer Greek quote, two speakers, an unknown speaker, and Serbian Latin text.

Verify the server HTML and OG response with an HTTP client using a bot user agent. The metadata must exist without client JavaScript; the image must decode to 1200×630. Render and inspect the actual PNG for cropping, accent glyphs, attribution, and contrast. Do not count a jsdom test as proof of mobile selection or OG layout. Record any unavailable device coverage in the implementation report.

Use local fixtures to edit the selected source and to unrelease the meeting. Re-fetch both page and image and confirm they stop exposing the old quote as current accessible content. Document URL semantics, the source-change limitation, and completed browser cases in `docs/guides/sharing.md`.

## Test plan

Model server-query mocks after `src/lib/__tests__/meetingSummary.test.ts`; assert data eligibility and query bounds, not just output snapshots. Model component tests after `src/components/meetings/subject/__tests__/UtteranceReferenceLink.test.tsx`.

Required cases include: partial single utterance; two same-speaker utterances; cross-speaker selection; backward DOM selection; selection touching buttons/headers; zero timestamp; malformed selectors; excessive rows/text; missing person; source text or speaker correction; a hidden unreviewed transcript; an unreleased meeting even for an editor; foreign-realm requests; locale-preserving URLs; opening a Serbian Latin excerpt's full transcript after switching the share UI to English; unavailable OG image; clipboard failure; native-share cancellation; and two selections with distinct OG URLs.

## Done criteria

- [x] The new selector, resolver, route, component, and image tests pass.
- [x] Typecheck, localization, lint, and build gates pass, with any unrelated baseline failures explicitly recorded.
- [x] The DOM-selection tests prove exact offsets and multi-speaker attribution.
- [x] Route tests prove server metadata exists without browser JS and references the correct selection-specific image.
- [x] Page and image tests reject non-public and source-changed content.
- [x] No dependency or schema change appears in `git diff --name-only`.
- [x] Browser and rendered-image verification results are recorded; untested devices are identified.
- [x] `plans/README.md` status is updated.

## Git workflow and STOP conditions

Use branch `codex/share-transcript-excerpts` if creating a branch. Follow Conventional Commits, for example `feat(sharing): add source-backed transcript excerpts`. Follow existing fixup/squash rules if working on an existing PR. Do not publish, push, or create external issues merely because this plan exists.

Report before broadening scope if bounded lookup cannot reproduce transcript order, an essential selected passage cannot be represented by the selector, the public review rule differs from the cited implementation, or preserving historical quotes becomes a requirement. Fix routine test failures normally; report an unresolved failure after two reasonable attempts with its evidence.

## Maintenance notes

Transcript regeneration can invalidate source IDs. Text/script transformation changes can invalidate offsets or digests. Keep the selector versionable and the failure state explicit. Review future caches for release/review changes. An external platform can retain a previously fetched image despite later source changes; do not promise remote cache invalidation.
