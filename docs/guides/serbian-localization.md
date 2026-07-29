# Serbian Localization (sr / sr-Latn)

How Serbian works in OpenCouncil, and the workflow for the native reviewer whose
sign-off gates the serbia realm launch.

## Architecture in one paragraph

Serbian is digraphic. **Cyrillic is canonical everywhere**: the hand-maintained
UI catalogs are `messages/sr.json` + `messages/sr/*.json`, and the Latin
catalogs (`messages/sr-Latn.json` + `messages/sr-Latn/*`) are **generated** from
them by `npm run generate:sr-latn` — never edit them by hand; a CI test fails
when they are stale. Dynamic content (transcripts, AI summaries, names) is
stored in whatever script it arrives in and transliterated **at render time**
to the viewer's chosen script (the Ћир | Lat toggle in the header); the
database is never rewritten. The transliterator lives in `src/lib/serbian/`
— Cyrillic→Latin is a plain character map; Latin→Cyrillic is word-tokenized
with digraph handling (lj/nj/dž), a prefix exception list, and skip rules for
foreign words, brands, URLs and emails.

## Status: machine-translated, awaiting native review

The catalogs (~4,000 strings) were machine-translated from English (ekavian,
formal ви-form, lowercase mid-sentence). Terminology was aligned with official
sources where it could be verified without a native speaker — but **the serbia
realm must not launch before a native speaker has reviewed the catalogs** and
checked off the list below.

## Glossary

Decisions made so far, with sources. Extend this table as you review; the test
`src/lib/__tests__/sr-glossary.test.ts` mechanically enforces the banned/required
entries, so add to it when you settle a term.

| English | Serbian (Cyrillic) | Notes / source |
|---|---|---|
| public consultation | јавна расправа | Statutory term, Zakon o lokalnoj samoupravi. Never "консултације" (enforced by test) |
| municipality | општина | |
| city | град | |
| city/municipal assembly | скупштина града / скупштина општине | The deliberative body whose sessions the platform covers |
| assembly member, councilor | одборник | Directly elected assembly members |
| executive council | градско веће / општинско веће | Members are "чланови већа" (colloq. "већници") — distinct from одборници |
| mayor | градоначелник (град) / председник општине (општина) | Title depends on the unit type; strings currently use градоначелник — review where the општина form is needed |
| (council) meeting, session | седница | |
| agenda | дневни ред | |
| agenda item / subject | тема | UI uses тема for discussion subjects; "тачка дневног реда" is the formal phrase — reviewer's call where formality fits |
| topic (category label) | категорија | |
| minutes (document) | записник | |
| transcript | транскрипт | |
| speaker | говорник | |
| political party | странка | |
| neighborhood / local community | месна заједница | Not yet used in strings; relevant for location features |
| notification | обавештење | |
| search | претрага | |
| settings | подешавања | |

Style conventions:

- **Ekavian** standard (Serbia), Cyrillic source.
- **Formal address, lowercase**: ви/вас/вам/ваш mid-sentence (capitalized only
  at sentence start). Enforced by test.
- Brand names (OpenCouncil, YouTube, …) and technical tokens stay in Latin
  script in both catalogs.
- ICU plurals use Serbian categories `one`/`few`/`other` (paucal 2–4 → `few`).

## Viewing the serbia realm

`opencouncil.rs` has no DNS yet, so use the `?realm=serbia` override on any
non-production host (see the preview deployments guide):

- **PR preview**: open `https://pr-N.preview.opencouncil.gr/?realm=serbia`.
  The seed data includes a Belgrade review fixture — open `/beograd` for a
  released meeting with a Cyrillic-stored and a Latin-stored speaker segment,
  agenda subjects and Serbian topics; use the Ћир | Lat switcher (or the
  `/lat` URL prefix) to check both scripts.
- **Local dev**: `http://localhost:3000/?realm=serbia` after `npx prisma db
  seed` (the fixture seeds idempotently alongside the dump).
- Alternatively, spoof the Host header: `curl -H 'Host: opencouncil.rs'
  localhost:3000/beograd`.

Switch back with `?realm=greece`.

## Reviewer workflow

1. Edit **only** `messages/sr.json` and `messages/sr/*.json` (PRs welcome —
   the JSON diffs are the review artifact).
2. Run `npm run generate:sr-latn` to refresh the Latin catalogs, and commit
   both.
3. Run `npm test` — guards that protect you:
   - key parity with English (`translations.test.ts`)
   - Latin catalogs not stale + ICU syntax intact (`sr-latn-catalog.test.ts`)
   - every message parses as ICU with English-matching arguments
     (`scripts/validate-sr-catalogs.ts`, run inside the test suite)
   - glossary bans/requirements (`sr-glossary.test.ts`) — extend as you decide terms
4. The transliterator's word lists are also yours to extend as real content
   surfaces errors:
   - `src/lib/serbian/exceptions.ts` → `EXCEPTION_STEMS`: words where nj/dž are
     two letters (инјекција, наджанр, …)
   - `PROTECTED_WORDS`: Latin words that must never be converted to Cyrillic

### Review checklist

Main catalog (`messages/sr.json`), one checkbox per namespace:

- [ ] Landing, MunicipalitySelector, Common, PilotPage, Header, Footer
- [ ] CitiesList, CityForm, City, EmbedConfigurator, EmbedWidget
- [ ] AddMeetingForm, NotFoundPage, AboutPage, InputWithDerivatives
- [ ] TranscriptOptions, Chat, Onboarding, ImageCropDialog, PartyForm
- [ ] PersonForm, RolesList, PersonCard, Unsubscribe, NotificationPreferences
- [ ] Profile, OfferForm, Offer, MeetingCard, Person, Party, MeetingStatus
- [ ] AdministrativeBodiesList, RSS, PartyMemberRankingSheet, ElectedOrderSheet
- [ ] Subject, CouncilMeeting, ProductUpdates

Modular catalogs (`messages/sr/`):

- [ ] CookieConsent, topicFilter, search, reviews
- [ ] transcript, editing, highlights
- [ ] landingV2, admin, about

Cross-cutting:

- [ ] Plural branches grammatical for 1 / 2–4 / 5+ across count-bearing messages
- [ ] Ви-form consistency and tone
- [ ] град/општина title correctness wherever mayor/assembly titles appear
- [ ] Transliterator spot check on real content: Ћир and Lat views of a seeded
      meeting (`curl -H 'Host: opencouncil.rs' localhost:3000/...` and `/lat/...`)

**Launch gate: all boxes checked by a native speaker before the serbia realm
goes live.**

## Known deferred gaps (not blockers for review, tracked separately)

- Latin→Cyrillic transliteration of dynamic content converts any token made
  only of Serbian-valid letters, so unlisted foreign names ("Microsoft") render
  as naive Cyrillic in the Ћир view of Latin-stored text. Inherent to
  script-guessing (Wikipedia's sr converter has the same issue); mitigated by
  the auto-skip for q/w/x/y/accented letters, URLs and emails, plus the
  extensible `PROTECTED_WORDS` list. Only affects Latin-stored content —
  Cyrillic-stored content (the canonical direction) is unaffected, and
  Cyrillic→Latin is lossless.
- Elasticsearch uses a Greek analyzer — Serbian full-text search quality will be
  poor and script-blind until a Serbian analyzer + Cyrillic/Latin folding is added.
- Sorting utilities use locale-default `localeCompare` — Serbian collation
  (`Intl.Collator('sr')`) not yet wired.
- Page metadata *descriptions* (and some marketing strings) remain Greek on
  Serbian pages, mirroring the existing French treatment.
- Serbian `Topic` taxonomy rows must be seeded before onboarding the first city
  (`getTopics('serbia')` is empty until then).
