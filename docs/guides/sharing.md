# Sharing excerpts, contributions and subjects

Readers can share a complete transcript passage or a speaker contribution. Publishers can embed one public subject.

## Transcript excerpts

Select text in the transcript. The selection expands to complete utterances that intersect the selected words.
The **Share excerpt** action previews these passages with speaker attribution and meeting context.
The transcript context menu provides the same action. Without a selection, it shares the saved utterance.

The dialog has two main actions: **Copy link** and **Share**. A quiet action copies the text with its source.
Supported browsers use native sharing. Other browsers show WhatsApp, Facebook and email links.
Copy feedback appears after the clipboard operation succeeds. A selectable URL appears only if copying or sharing fails.

Sharing also works on saved transcript spans in edit mode. Text inside an open editor must be saved first.
Draft meetings, hidden transcripts and highlight editing do not offer excerpt sharing.
Public transcripts without a successful human review show an AI warning above the shared quote.
The warning also appears in the share dialog, copied text, native sharing, metadata and social image.
A successful human review removes the warning without changing the quote digest. Hidden transcripts remain unavailable until their existing visibility rules permit access.

The source-backed URL is `/{locale}/share/excerpt` with these parameters:

| Parameter | Meaning |
|---|---|
| `cityId`, `meetingId` | The source meeting |
| `firstUtteranceId`, `lastUtteranceId` | The ordered endpoints |
| `textLocale` | The fixed source text locale, including Serbian script |
| `digest` | SHA-256 of the selected runs and their speaker attribution |

Each selected utterance contributes its complete saved text. A selection can contain up to 20,000 UTF-16 code units and 40 utterances.
The selection must be continuous. The client rejects oversized selections without shortening them.
New links contain no character offsets. URLs with legacy `startOffset` or `endOffset` fields are invalid.
The canonical digest uses version 2, so old partial quotes cannot silently become complete passages.

The server reconstructs the selected text. It does not accept quoted text, speaker names or context from the URL.
The digest detects source changes; it does not grant access. Changed words or attribution produce an explicit unavailable state.
Edits outside the selected utterances can preserve the link. Regenerated utterance IDs can invalidate it.

The recipient page shows the full selection, separate speakers and bounded surrounding text.
Whole utterances can include one adjacent utterance on each side, within the same speaker segment.
Transcript links preserve `textLocale` and the first timestamp, including zero. Whole-utterance highlighting appears only after the digest matches the displayed source.
React `<mark>` elements provide the same behavior across browsers. Arrival does not start playback.

The explicit `/api/og/excerpt` image route receives the same selectors.
Its image uses a bounded preview, with an ellipsis when necessary. Multi-speaker images show separate named passages.
The metadata description also limits each passage preview and preserves its speaker name. Recipient pages and copied text remain complete.

## Speaker contributions

Contribution cards on subject, person and party pages expose **Share contribution**.
Sharing does not require a playback timestamp or a matched person. Draft meeting cards suppress the action.

The recipient URL is `/{locale}/{cityId}/{meetingId}/subjects/{subjectId}?contribution={contributionId}#contribution-{contributionId}`.
It opens the full subject. The selected contribution has an orange highlight and a **Shared contribution** label.
The page scrolls to its heading without starting playback.
The server verifies the public contribution belongs to the exact subject, meeting and city before adding its metadata or highlight.
The canonical URL and structured data still identify the full subject. Invalid or private selections leave the ordinary subject unchanged.
Legacy `/{locale}/share/contribution/{contributionId}` links redirect to the real public subject.

The `/api/og/contribution?id=…&locale=…` image route uses the same public resolver.
Summary previews do not use quotation marks. These links show current summaries; they are not historical snapshots.
Removed or regenerated contributions are unavailable. The resolver does not guess a replacement.

Standalone transcript references are resolved in one batch, capped at 100 distinct IDs.
Each reference must belong to the contribution's meeting. Invalid or excess references remain plain text.
Hidden transcripts keep their summaries public but expose no transcript links or timestamps.

## Public subject embeds

Open a released subject's share menu and choose **Embed this subject**.
The dialog previews the exact iframe, provides light and dark modes, and supplies escaped HTML.
The preview loads only while the dialog is open.

The URL is `/{locale}/embed/subject?cityId=…&meetingId=…&subjectId=…&mode=light`.
Locale prefixes are explicit, including `/el/` and `/lat/`. Preview and copied HTML use the same URL and 420px height.
Long content can scroll inside the iframe. Every source link opens in a new tab.

The iframe reads one exact released subject. It does not substitute a recent or ranked subject.
Unknown cities return 404. Missing, mismatched, deleted or unreleased subjects show a neutral card with HTTP 200.
This route does not alter the editor-only feed configurator. See [Embed Widgets](./embed-widgets.md).

## Data access and caching

Database queries live in `src/lib/db/sharing/`. `src/lib/sharing/` exposes the shared interfaces and pure selection helpers.
Prisma selects remain lean. Excerpt queries read two endpoints, at most 41 selected rows, and at most two adjacent context rows.
Excerpt pages and OG images do not load the full transcript. Contribution links use the normal subject page data.

Share pages and images enforce release and request-realm visibility, including for signed-in editors.
Excerpt access also enforces the existing human-review rule.
Embeds follow the existing public widget policy and derive source domains from the city's realm.

New share pages, OG routes and the single-subject iframe use dynamic rendering and private/no-store responses.
The iframe retains `frame-ancestors *`. Existing feed-widget caching is unchanged.
External platforms can retain an older fetched preview. OpenCouncil cannot recall their cached images.

## Verification

Automated coverage includes complete-passage bounds, Greek text, emoji, Serbian scripts, native DOM expansion, clipboard failures and native-share cancellation.
Tests reject legacy offsets. They verify destination links, subject tuple checks, contribution metadata and scrolling.
Resolver and route tests cover release/realm/review guards, changed sources, bounded reads, zero timestamps, metadata and distinct speaker attribution.
Component tests cover person-page cards without video context, draft sharing suppression, source links, exact highlighting and synchronized embed previews.

On 2026-09-11, the refinement passed the full unit suite: 186 suites, 2,245 tests, with one existing skip.
After the final metadata bound, all 49 focused sharing tests passed across 10 suites.
TypeScript, ESLint and the production build passed. All 2,619 Serbian messages passed ICU and argument-parity validation.

Browser verification used fictional local records and the current application UI.
At 390×844, the excerpt page and dialog had no horizontal overflow.
A partial text selection expanded to the complete utterance. The transcript link marked that entire utterance and preserved its timestamp.
Saved-text sharing also worked through the editor context menu.
Direct contribution links opened the full subject, with one orange-highlighted card visible on desktop and mobile.
The mobile card stayed within the 390px viewport. The simpler dialog showed no URL field unless an operation failed.
The mobile refinement also passed at 320px: contribution text uses the full card width, controls have 44px touch targets, and the speaker name wraps independently.
The share button stays at the upper right. All sharing entry points use the same three-node icon.
Copy-link confirmation and inline source expansion were verified after the layout change. The nine affected sharing tests passed.
The subject share menu opened the embed dialog in both themes. Copy confirmation and the exact iframe target were verified.

HTTP checks verified server metadata, contribution references, exact subject lookup and source-change handling.
After a selected-word correction, the old quote disappeared. Unreleasing the fixture meeting removed excerpt and contribution content.
Rendered Greek single-speaker and multi-speaker OG images were inspected at 1200×630. Text and speaker attribution remained legible.

Production-mode checks returned HTTP 200 and private/no-store headers for the share pages, both OG routes and the subject iframe.
The refinement also passed direct-subject metadata, legacy redirects, whole-utterance links and legacy-offset rejection against the production build.
Both social image routes returned valid 1200×630 PNGs. Changed and unreleased source suppression remained correct.
The iframe retained `frame-ancestors *`. Source-change and unrelease checks also passed against the production build.
A separate-origin local article embedded the subject at 390px width. The dark theme filled the iframe, and long content scrolled correctly.

Actual touch hardware and audio playback were not tested. The fixtures contain no real council recording.
