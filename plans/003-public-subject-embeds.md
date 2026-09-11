# Plan 003: Let readers embed one public subject

> Follow this plan in order. Update its status in `plans/README.md` when finished.
>
> Drift check: `git diff --stat 743e50337..HEAD -- src/components/embed src/components/meetings/ShareDropdown.tsx src/components/subject/SubjectCardContent.tsx src/lib/sharing src/lib/utils/embedParams.ts src/lib/utils/embedBaseUrl.ts next.config.mjs src/proxy.ts docs/guides/embed-widgets.md messages`
> Plan 001's public data module is an expected dependency change. Reconcile its actual contract before implementing.

## Status

- Priority: P1
- Effort: M
- Risk: MED — third-party iframes need correct public access, source ownership, locale URLs, and response headers.
- Depends on: plan 001's lean public meeting/subject lookup; independent of contribution UI
- Category: direction
- Planned at: commit `743e50337`, 2026-09-10
- Completed and reviewed: 2026-09-11 on `codex/sharing-features`, rebased onto `6e951634c`. See [final review](README.md#final-review--2026-09-11) for accepted adjustments and verification limits.

## Why this matters

A journalist or neighborhood association should be able to include an OC subject in an article without an editor account. Readers see a concise summary and can open the original discussion. Existing widgets provide most of the presentation infrastructure, but do not offer this public single-subject workflow.

## Product contract

- On a subject page, the share menu includes **Embed this subject** for public subjects.
- A dialog displays the exact card preview, light/dark appearance choice, and a copyable iframe snippet. Copy success occurs only after the clipboard operation succeeds. Provide a selectable snippet as fallback.
- The iframe shows one subject: title, automatic-summary label, bounded summary, municipality, body/meeting/date, optional location/topic, a **Read the discussion** link, and OC attribution.
- Every source link opens OC in a new tab. The iframe needs no sign-in, video provider, transcript payload, or third-party script.
- Historical released subjects remain embeddable. A deleted or hidden subject displays an unavailable card, not another subject selected by ranking.

Keep the existing administrator-only feed configurator unchanged. Excerpt/contribution embeds, a video player, arbitrary HTML, custom CSS, carousel configuration, auto-resize scripts, and vote/attendance display are out of scope.

## Current state and excerpts

- `docs/guides/embed-widgets.md` documents public `/embed/meetings`, `/embed/subjects`, and `/embed/summary` routes.
- The existing configurator gate is explicit in `src/app/[locale]/(city)/[cityId]/(other)/(tabs)/widget/page.tsx:25-26`:

  ```ts
  const canEdit = await isUserAuthorizedToEdit({ cityId });
  if (!canEdit) notFound();
  ```

- `src/lib/db/meetingSummary.ts` demonstrates a lean released-only read. `src/lib/db/types/meetingSummary.ts` derives types from `satisfies Prisma.CouncilMeetingSelect`.
- `getSubject()` in `src/lib/db/subject.ts:552-572` reads by ID and includes votes, attendance, and highlights. `getMeetingDataCached` loads a full transcript and is session-sensitive. Neither belongs in this iframe.
- `SubjectCardContent.tsx` accepts already prepared title, description, context, location, topic, and footer props. Existing `EmbedSubjectCard.tsx` wraps that presentation, but its current data type requires statistics/speaker data. Reuse the presentation rather than fabricate unused statistics.
- The minimal `(embed)/layout.tsx` sets noindex. `src/lib/utils/embed.ts` matches all embed routes to suppress unrelated analytics and dev UI.
- `next.config.mjs:54-57` currently applies these headers to localized widget URLs:

  ```ts
  source: '/:locale/embed/:path*',
  headers: [
      { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
      { key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=3600' },
  ],
  ```

- `embedBaseUrl(city.realm)` uses the city's production realm domain and preserves a local/preview origin. `embedLocalePrefix(locale)` supplies locale-aware source links. For the iframe itself, use an explicit locale URL via `urlPrefixForLocale`, including `/el/` and Serbian `/lat/`.
- `ShareDropdown.tsx` receives `cityId` and `meetingId`, uses pathname to identify subject context, and closes its menu before opening the existing Story dialog. Follow that dialog transition pattern.

## Architecture and access

Add `src/app/[locale]/(embed)/embed/subject/page.tsx` with validated `cityId`, `meetingId`, and `subjectId` query params, plus `mode=light|dark`. Use the existing embed theme defaults rather than introducing another style system.

Fetch the exact requested subject scoped to its city and meeting and to `meeting.released: true`. The new `src/lib/sharing/publicContent.ts` from plan 001 should provide or be extended with this lean lookup. Its call from an embed must follow the current widget policy: derive the public source domain from the subject's city realm, without reading request headers or applying an editor override. Share-page callers use request-realm checks; do not accidentally remove those checks while supporting widget callers.

Select only the fields shown by this card, including the city realm/timezone, localized display names, and subject summary. Do not select transcript, highlights, votes, attendance, or all meeting subjects. Do not use the recent/hot-subject ranking pipeline for an explicitly chosen historical subject.

For an unknown city, return 404. For invalid/missing subject or meeting parameters, a mismatched subject/meeting tuple, a deleted subject, or an unreleased meeting, render a neutral localized unavailable card. Use HTTP 200 for the unavailable iframe body, matching the existing pinned-meeting widget convention. Return no hidden title, summary, source URL, or record metadata.

For this first single-subject route, prefer **no-store** data and page responses. Add a narrow header override for the explicit subject-embed route after the general embed rule while retaining `frame-ancestors *`. Also handle the unprefixed route if it remains reachable after i18n rewriting. Verify actual response headers: configuration order alone is not proof. This avoids creating a new stale-content window when a publisher embeds a subject that is later hidden. Do not change the caching of existing feed widgets. Do not add a separate subject cache in v1.

Build snippet URLs from validated IDs and `URLSearchParams`. Never copy `window.location.href`: it can contain playback time, excerpt selectors, or unrelated filters. The client uses the current origin for the preview, preserving preview hosts. Source links inside the iframe use `embedBaseUrl(city.realm)` and the existing locale helper. Escape HTML attribute characters when constructing the snippet, including `&` and quotation marks.

Default snippet:

```html
<iframe src="VALIDATED_LOCALIZED_EMBED_URL" title="LOCALIZED_ACCESSIBLE_TITLE" width="100%" height="420" style="border:0;" loading="lazy"></iframe>
```

The 420px height is a starting target to verify with real fixtures. Clamp the visual title/summary, retain their full accessible text where appropriate, and keep the source link visible at 320px width. Do not disable iframe scrolling if content still exceeds that height. If the final card requires a different height, change the preview and snippet constant together and record the validated size.

## Scope

New files:

- `src/app/[locale]/(embed)/embed/subject/page.tsx`
- `src/components/embed/{EmbedSingleSubject,SubjectEmbedDialog}.tsx`
- `src/components/embed/__tests__/{EmbedSingleSubject,SubjectEmbedDialog}.test.tsx`
- `src/components/meetings/__tests__/ShareDropdown.test.tsx`
- `src/lib/sharing/subjectEmbed.ts` for URL/snippet parsing and formatting, plus `src/lib/sharing/__tests__/subjectEmbed.test.ts`
- `src/app/__tests__/embed-subject.test.tsx`

Existing files allowed: `src/lib/sharing/publicContent.ts` and its tests, `src/components/meetings/ShareDropdown.tsx`, existing `embed.css` for a narrowly scoped card rule, `next.config.mjs`, `messages/{el,en,fr,sr}/sharing.json`, `docs/guides/embed-widgets.md`, and `plans/README.md`.

If explicit route parameters cannot be obtained safely inside `ShareDropdown`, also allow the meeting `layout.tsx` to pass a validated subject target through the existing shared header context. Prefer `useParams` with a single-string subject ID over inventing another global provider.

Out of scope: the admin widget page and configurator, existing widget data pipelines, schema, new dependencies, global authentication changes, the proxy unless actual route tests demonstrate a required change, and public vote/attendance data.

## Commands and baseline

Use Node 24/npm from the repository root. Follow `CLAUDE.md` and `CONTRIBUTING.md`. Use local fixtures; no production queries or external site publishing are required.

| Purpose | Command | Success |
|---|---|---|
| Focused tests | `npm test -- --runInBand --testPathPatterns='embed|Embed|publicContent'` | All selected suites pass |
| Typecheck | `npx tsc --noEmit --incremental false` | No new errors |
| Catalog checks | `npm test -- --runInBand --runTestsByPath src/lib/__tests__/sr-latn-catalog.test.ts` | All pass |
| Lint | `npm run lint -- --quiet` | No new errors |
| Build | `npm run build` | Completes in safe local configuration |

During planning, existing embed base-URL, parameter, and meeting-summary component tests passed. A complete application typecheck/build was not run.

## Steps and verification

### 1. Add the exact public-subject lookup and snippet helper

Extend the shared public resolver with a lean exact-subject select. Keep the identity tuple and release filter in the query. Create `subjectEmbed.ts` with strict input parsing, locale-aware URL generation, appearance defaults, fixed verified-height constant, and escaped snippet generation.

Verify: `npm test -- --runInBand --testPathPatterns='publicContent|subjectEmbed|embedBaseUrl|embedParams'` → wrong city, wrong meeting, missing/draft subjects, special-character attributes, locale prefixes, and production/preview domains pass. Assert that the query does not select private relations or transcript data. Follow `src/lib/__tests__/meetingSummary.test.ts` for query tests.

### 2. Render the iframe card and response policy

Create `EmbedSingleSubject` and the route using the existing shared subject presentation, theme variables, and OC footer. Strip markdown through the existing helper; do not render raw HTML. Mark the summary as automatic. Missing summary/location/photo must not leave fake values or broken placeholders.

Apply the selected dark mode class and the existing app-theme shim when using `SubjectCardContent`. Keep every outbound link usable in a third-party iframe, with `target="_blank"` and `rel="noopener noreferrer"`.

Add only the new route's no-store override. Keep CSP framing enabled and noindex inherited from `(embed)`.

Verify: `npm test -- --runInBand --testPathPatterns='EmbedSingleSubject|embed-subject'` → exact historical subject, unavailable states, summary label, plain text rendering, themes, and source links pass. Use `src/components/embed/__tests__/EmbedMeetingSummary.test.tsx` as the component-test pattern.

### 3. Add the public dialog to subject sharing

Show the entry only with a valid current subject target. Close the share menu before opening the preview dialog. Use the exact same URL helper for the iframe preview and copied snippet. Updating mode updates both. Re-read the subject identity on navigation; do not keep stale state from the previous subject.

Do not mount an iframe until the dialog opens. Show a selectable read-only snippet, a copy button, pending/success/error feedback, and keyboard-accessible controls. Preserve existing timestamp sharing and meeting Story exports.

Verify: `npm test -- --runInBand --testPathPatterns='SubjectEmbedDialog|ShareDropdown|subjectEmbed'` → anonymous availability, subject-only visibility, correct subject after navigation, matching preview/snippet mode, clean query params, clipboard rejection/retry, and menu-to-dialog focus behavior pass. Add a `ShareDropdown` regression test under its existing component test area or colocated `__tests__` if none exists.

### 4. Verify embedding from a different origin

Run all commands above. Use a small temporary local HTML fixture on a different port to host the copied iframe. This fixture is a development verification artifact, not a production file or third-party publication.

Verify the actual response headers for both explicit-locale and reachable unprefixed URLs: framing is allowed, and the new route is no-store. Inspect the card at 320px and 640px widths, in light/dark modes, with long Greek title/summary and missing optional fields. The source CTA and attribution must remain reachable without horizontal scrolling. Follow the source link and confirm the correct realm, locale, and subject.

Unrelease a local fixture meeting and reload the iframe to verify that its text disappears. Confirm the existing administrator configurator still rejects a non-editor and that the three existing widgets retain their behavior.

Update `docs/guides/embed-widgets.md` with the new route, params, public entry point, snippet, unavailable state, and caching difference.

## Done criteria and STOP conditions

- [x] An anonymous reader can copy an exact-subject iframe from the subject share menu.
- [x] New tests prove the subject/city/meeting/release scope and absence of private relation payloads.
- [x] Preview and snippet tests prove matching URLs and escaped HTML attributes.
- [x] Existing embed parameter/base-URL/summary tests still pass.
- [x] Route/component tests cover historical subjects, unavailable content, optional fields, locale, and dark mode.
- [x] Actual iframe response headers and cross-origin rendering are verified and recorded.
- [x] Typecheck, catalog, lint, and build results are recorded with any unchanged baseline failures.
- [x] The admin configurator gate is unchanged in `git diff`.
- [x] `plans/README.md` is updated.

Use `codex/public-subject-embeds` if creating a branch and Conventional Commits such as `feat(embed): share individual subject widgets`. Do not push or publish to an external site merely because this plan exists.

Report before broadening scope if a global proxy change is required, the deployment cannot honor the per-route no-store policy, or this card requires hidden data to render. Resolve routine test failures normally; report an unresolved failure after two reasonable attempts.

## Maintenance notes

Subject regeneration can invalidate an article's pinned subject ID. The unavailable state is intentional; do not replace it with a ranked subject. Future caching must explicitly account for release changes. Keep iframe height and presentation limits synchronized, and preserve the difference between public single-subject embedding and administrative feed configuration.
