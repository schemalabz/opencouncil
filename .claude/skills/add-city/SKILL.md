---
name: add-city
description: Onboard a municipality into OpenCouncil, in any country — research its council, officers and groups from the country's official sources, build and validate the populate_city payload, stop for approval, populate, then prepare its newest meetings (agenda and video) for processing. Country specifics live in references/countries/<cc>.md (Greece, France so far). Use when asked to add, onboard or set up a city or a demo city.
---

# add-city

Turns a municipality into a populated city with its newest meetings ready for processing.
You (the session) do all reading and judgement. Writes go through the OpenCouncil MCP.
Decisions are out of scope: a body's decision conventions are set on its admin page, and pollDecisions reads the decisions. Where the country publishes decisions per unit, the country file says how to find each body's unit, and the payload carries it (Greece: `diavgeiaUnitIds`).

## Before you start

- **Country file.** Read `references/countries/<cc>.md` (`gr.md`, `fr.md`): the bodies, the sources in order of trust, the role mapping, names, meetings and decisions for that country. It overrides the generic wording below. **No file for the country yet** ⇒ fill `references/countries/_TEMPLATE.md` from research (a link and the date checked for every source), save it as `<cc>.md` and stop for review before importing anything. Each city that teaches something new about its country updates that file; notes about one city stay in `.context/`.
- **Target environment and realm.** The OpenCouncil MCP connector you write through decides where the city lands (production, staging or a local dev server; its `get_city` URLs show the host). A superadmin connection reaches every realm: pass the country's `realm` to `create_city` (`poland`, `spain`, …); every tool that takes the city's id then works on that city whatever the connection's domain, and its links go to the city's own domain. Lists and searches (`list_cities`, `search`) stay on the connection's realm: an MCP URL belongs to one realm (opencouncil.gr → greece), and on a non-production host the header `Cookie: oc-realm=<realm>` selects another. Name the environment and the realm to the user before the first write. Never write to production unless the user asked for production in this session.
- **Tools.** OpenCouncil MCP with an admin (superadmin) token: `get_city`, `create_city`, `list_people`, `populate_city`, `list_meetings`, `create_meeting`, `update_meeting`, `create_agenda_upload_url`, `start_task`. The country file names the country's own tools (Greece: the Diavgeia CLI and MCP). Shell: `curl`, `npx tsx` (the skill's scripts), `yt-dlp` (`nix shell nixpkgs#yt-dlp`, always with `--no-update`), `ffmpeg`, `chromium` and `img2pdf` (`nix shell nixpkgs#chromium nixpkgs#img2pdf` when missing). Read and filter JSON (search results, signer lists) with `node -e`, which the scripts already need; never write Python helpers. The built-in browser for pages that need a browser (decline optional cookies, never sign in).
- **Read sources as page images.** Download each PDF and read its pages with the Read tool, which shows them as images: a text layer can be broken, can mix Latin letters into Greek words, or can be missing (a scan). Never read a source through `pdftotext` or another text layer. Reading pages costs context, so give the reading to subagents: one subagent per group of documents, asked a precise question (the newest roll call; the holder of each office today, with the act and its date) and told to return exact quoted lines (names, roles, dates) with the document id and page, not summaries. Open a page yourself only when a verdict depends on it (a roll call, a table). A subagent returns its findings as text; the session writes the files.
- **Working folder.** `.context/<date>-<cityId>-add-city/` (untracked): `roster.json`, `payload.json`, `summary.txt`, `sources.md` (source → what it proved), `REPORT.md`, `pdf/` (downloaded documents, named by their id) and `agenda/`.

## Steps

### 1. The city
`list_realms` names the realms, their domains and how many cities each has; `list_cities(realm, includePending: true)` shows whether the city exists already, pre-loaded or pending. Then `get_city(cityId)`: it must have no people, parties or meetings — `populate_city` runs once per city. A pre-loaded city can carry leftovers (Trikala: one party and no people) or wrong fields (a doubled «Δήμος» in the municipality name, an accented `name_en`). No MCP tool deletes them or edits a city: list them for an admin at the checkpoint, and wait until they are fixed before `populate_city`. If it does not exist (the country file says whether cities are pre-loaded), propose `create_city` (id = URL slug, names in the local language and in English, the official name, IANA time zone, the language from step 2b, and the country's `realm`) at the checkpoint.

### 2. Do they publish meeting video?
A city without video can still be imported (roles only); say so early.
1. Find the official website with a web search (do not guess the domain), then follow its links. Its footer/header usually links its YouTube/Facebook channels; a sitting's own page often embeds its video. The site's channel can be a press channel: the invitation's footer often names the channel that streams the sittings, and a channel with no recent sittings is the wrong one.
2. Otherwise search YouTube with the country's words for the council (country file) and keep only the municipality's channel or a local outlet that streams it — not a faction's channel.
3. List the channel: `.../streams` (live sessions) and `.../videos` (uploads). A missing `/streams` tab errors in yt-dlp — that means no live streams, not a failure. Relevance search can miss small channels: try `https://www.youtube.com/results?search_query=<q>&sp=CAI%253D` (upload-date sort).
4. `--flat-playlist` gives no dates: get them per video with `yt-dlp --no-update --skip-download --print "%(release_timestamp)s %(timestamp)s %(duration_string)s %(title)s" <url> <url> …` (one call for several videos), or the same `--print` on the channel tab with `--playlist-end N` and without `--flat-playlist`. A channel-tab listing prints `%(channel)s` as NA; `ytsearch` prints it. The timestamps are UTC (a format such as `%(release_timestamp>%H:%M)s` prints UTC too): the meeting's `dateTime` comes from the invitation, in the city's local time, and the stream's start only matches a video to a sitting (Αγία Παρασκευή: a stream at 11:46 UTC was the 15:00 sitting).
5. Facebook: yt-dlp cannot list a page; open `facebook.com/<page>/videos` in the built-in browser, then read each video URL with yt-dlp.
6. **Record the channel**: the channel that streams a body's sittings goes on that body in the roster as `youtubeChannelUrl` (`https://www.youtube.com/channel/UC…` or `https://www.youtube.com/@handle`; never a video, playlist or `/c/` URL). Livestream polling uses it to attach the video of each later meeting. A local outlet's channel qualifies only when it streams every sitting of the body; Facebook pages have no field.
7. **Take the newest sitting**, even when its video is only a live on Facebook (uploads elsewhere can come weeks later). Some channels have no lives and upload in batches weeks later (Thermi: five sittings in one day, three weeks late); the newest sitting with a video is then older than the newest invitation — say so. For a demo, prefer a substantive sitting (an hour or more, several debated items) among the newest few: the user replaced Thermi's newest 26-minute sitting with a 2½-hour one.

### 2b. Which language does the council speak?
The city's `language` is the language its council speaks in meetings: it selects the speech recognition and the language of every summary. Never assume the country's language. Follow `references/content-language.md`: find the municipality's region in its table and in the official list it names (the country file names the country's default and its regions), and read the municipality's minutes and agendas where the table says "check". An agent cannot listen to a meeting, so do not judge the language from its audio. Write the value and what decided it in `sources.md`.
- A language that is not a `CityLanguage` value (Basque, Frisian, Ladin, Sorbian, …), a mixed council, or evidence that disagrees with the table ⇒ stop and ask the user at the checkpoint, with what you found. Do not pick the nearest supported language.
- A pre-loaded city already has a language (the Language column of the admin cities table; `get_city` does not show it): check it against the same evidence, and list a wrong one for an admin at the checkpoint, like the other wrong fields of step 1.

### 3. Sources of the roster
Follow the country file's sources, in its order of trust. Record every finding with its source (document id, URL, date) in `sources.md`.

### 4. Roles — the checklist
The country file adds its specifics (offices, committees, local titles). For every country:
1. **Roster**: the newest complete list of members (seat count must match the law). An official register is a cross-check, never the roster.
2. **Who took the seats**: compare with the first list of the term; every difference is a replacement to explain from a source. An unexplained replacement is a doubt for the checkpoint, not a reason to invent one.
3. **Parties**: what the council itself uses — election lists (Greece) or council groups (France). Their official names, sizes, and leaders as the source states them; no statement ⇒ no leader, and say so.
4. **Officers and city roles** (mayor, deputies, delegated councillors, presidium, committee, and the councillors who preside over a municipal entity): from the newest act that names them; the country file says which are city roles and which are body roles, and how titles are written.
5. **Role dates** (one policy for every country):
   - `startDate`: the act's or the election's start, when a source states it. Plain council membership: none.
   - `endDate`: only for roles that already ended (resignation, revocation, an expired one-off duty, a move to another role). Never copy a future term end.
   - Scope: the current half-term (or term), plus the roles that ended inside it.
   - Overlapping roles are kept. A portfolio that a later act adds to a person is a second city role with that act's date; the first role stays as it is.
   - A member who died or resigned leaves the roster; the successor goes in once a source shows the seat taken — flag a pending one.
6. **Names**: the country file's rules (order, case, transliteration, which source wins for spelling).

### 5. Payload
Write `roster.json`, then build and validate it in one command:
```
npx tsx --tsconfig tsconfig.json .claude/skills/add-city/scripts/payload.ts <dir>/roster.json --summary
```
It writes `<dir>/payload.json`, prints the council order and (with `--summary`) every role, then checks the payload as `populate_city` checks it — the schema, and that every role names a party or body of the payload — and prints `VALID`, or each problem and exits 1. It touches no database. The roster's shape picks the convention (the file's header documents both): a `factions` roster gets the Greek conventions (presidium, committee and faction order, ELOT 743 for a missing `name_en`, the member count against `"seats"` from the country's election data; example `references/roster.example.json`), and a `bodies` roster, whose titles are already written per the country file, is only shaped and numbered (a missing `name_en` copies `name`: give it for every person when the local script is not Latin). Both stop on a name that matches nobody, a duplicate person and a party that is not in `parties`; the Greek convention also stops on one person in two presidium posts and on a current committee chair who is also listed as a member. Do not hand-edit payload.json.

### 5b. Find the meetings (before the checkpoint)
Do the discovery half of step 7 now — for each body: the newest sitting, its video (one or several parts, start time) and its agenda (URL, file format) — so the checkpoint can show it. Match each video to a sitting by date and start time, not by title.

**A sitting needs its official agenda.** Take only a sitting whose agenda you found in an official source: the invitation on the municipality's site, an email from the municipality, or a document the user gives you. No official agenda for the newest sitting ⇒ take the newest sitting that has one, and say so at the checkpoint. Never build an agenda from other documents, such as the sitting's decisions on Diavgeia: a decision that is not posted yet drops its item, and every later item moves up by one (Αγία Παρασκευή, committee 21/10/2026: item 8 had no posted decision, so items 9–11 were numbered 8–10 and needed a database fix). A video with no agenda is a reason to choose another sitting, not to fill the gap.

### 6. CHECKPOINT — approval
Present, in this order, and wait for a yes before `create_city`/`populate_city`:
1. Target environment, realm and city (and the `create_city` arguments when the city is new), the council's language and what decided it (step 2b), and the leftovers or wrong city fields that an admin must fix first (step 1).
2. The `--summary` output (each body with its channel and decision units; council order with parties and officers; committees; city roles; party leaders).
3. Sources: one line per role group with its source.
4. Defaults: placeholder colours/English names, independents, missing leaders, replacements found, role-date choices, spelling choices.
5. Doubts: anything unexplained.
6. Meetings found in step 5b, with the kind, urgency and session number each invitation prints, and the invitation's source (or "no video").
Then call `populate_city` with the payload, before any `create_meeting`: populate refuses a city that already has a meeting. On production the permission classifier can refuse the call even after the yes: ask the user to allow it, and never work around it. Then `list_people(cityId, activeOnly: false)` and compare the people and role counts with the payload (the default lists current roles only). Then `get_city(cityId)`: the administrative bodies must be exactly the payload's bodies. `get_city` does not show a body's channel or decision units: check them on each body's admin page. Report an extra body (the Rennes demo once had an extra empty «Δημοτικό Συμβούλιο») — do not delete it yourself.

### 6b. Boundary and logo (after populate)
- **Boundary**: the official outline of the municipality (the commune, not a metropolis or a district), from the source the country file names. Check before use: one polygon or multipolygon, WGS84 (EPSG:4326), and an area close to the official surface. Save it as `<dir>/boundary.geojson`. The MCP cannot set it: a superadmin pastes it in the city's edit form on the site (`PUT /api/cities/<cityId>` → `parseBoundaryInput`). Without a boundary, the map and «nearby» features do not work for the city.
- **Logo**: only the municipality's own official logo, from its own site or graphic charter — never a search result, Wikipedia or a redraw. Read the city's terms of use first: if its use needs permission (Rouen: «nécessite un accord préalable de la Direction de la Communication»), do not add it; report the rule and the contact instead. Add it only when the source is official and its use is allowed.

### 7. Meetings
For each body with video, the newest sitting (step 5b):
- **Agenda**: the official one (country file says where). Prefer PDF/.docx (the task server reads only those). HTML ⇒ `chromium --headless --no-pdf-header-footer --print-to-pdf=<file> <url>`. Scanned images ⇒ one PDF (`img2pdf`). A scanned PDF is fine (processAgenda gives the PDF to the model, which reads the page images); a .docx that holds only scanned images fails — convert it to PDF. The document may be in an `<iframe>`/embed, not an `<a href>`. When the official site is down, a reprint is a source — say so, and prefer the official document when it returns. Other fallbacks: the Wayback Machine (its CDX API can rate-limit with 429), or ask the user to fetch the page from a local IP address (some sites block foreign addresses).
- **Store the agenda with us**: `create_agenda_upload_url(cityId, identifier=<YYYY-MM-DD>[-<body slug>][-<HHMM>], format)` (lower-case Latin letters, digits and dashes, at most 40 characters) (add the start time when one body holds two sessions on one day, so that the two files are easy to tell apart), then `curl -X PUT -T <file> -H "<each returned header>" <uploadUrl>`; use the returned `publicUrl`.
- **Video**: one video per meeting, the whole sitting. A live split into parts (Facebook cuts lives at 8 hours) ⇒ download the parts in the same format and join them (`ffmpeg -f concat`). Check the duration and the join, and upload the joined file to our Spaces with the app's `DO_SPACES_*` settings (`.env`): key `uploads/<cityId>_<YYYY-MM-DD>[-<body slug>].mp4` (the meeting id does not exist yet: `create_meeting` makes it from the date), header `x-amz-acl: public-read`, then check that the public URL opens and use it as the video URL. An upload to shared storage needs the user's yes. YouTube, Facebook, Spaces and direct mp4 URLs are all accepted by the task server.
- **One video, several sessions** (e.g. a special and a regular session streamed together): one meeting per agenda if the video can be split by time, otherwise one meeting for the regular session's agenda — say which. Two sessions on one day with their own videos are two meetings.
- **A body without video**: report its newest agenda; do not create a meeting unless the user asks.
- **The meeting's title**: the site builds it from the meeting's record, not from a name: `create_meeting` has no name field. For a Greek city, pass what the invitation prints: `kind` (e.g. ordinary for «Τακτική»), `urgent` for «Έκτακτη»/«Κατεπείγουσα», and `sessionNumber` (3 for «3η Τακτική»; never compute it). For a Greek city, processAgenda fills each of these fields that you leave empty from the invitation, and reports a difference for a field that you set. Every kind except ordinary belongs to a council only. Leave the three out for a city of another realm.
- `list_meetings` for that date first (a second create makes a duplicate), then `create_meeting(cityId, administrativeBodyId, dateTime with the city's UTC offset, youtubeUrl, agendaUrl, processAgenda: true, and the record above)`.
- `start_task(transcribe)`. fixTranscript (speaker names) starts by itself when transcription ends. Speaker review and summarize happen on the platform — this skill ends here. Decisions come after, outside this skill: pollDecisions once summarize has finished (out-of-agenda subjects exist only after summarize). On a local dev server the task API is off: create the meeting, skip the tasks.

### 8. Report
City link, people/roles counts, meetings with links and task ids, boundary (ready or set) and logo (added, or why not), defaults, doubts, `sources.md`; and what the run added to the country file.

Then what an admin does to take the city live, with the values the run found: set the city to `supported` (it stays `pending` until then), and check what the automatic work needs. The crons start paid work only for a supported city: decision polling needs the city's decision-source id (Greece: the Diavgeia org uid); without a body's units (`diavgeiaUnitIds`) it searches the whole organisation, which finds many unrelated decisions, and it reads a decision's contents only when the body has decision conventions. Livestream polling needs each body's `youtubeChannelUrl`. Say which of these are missing.

## Never
- Never write to production unless the user asked for it in this session.
- Never call `create_city`/`populate_city` before the checkpoint.
- Never set a city's language without the evidence of step 2b, and never start transcription for a council whose language is not supported or not decided.
- Never invent a role or a replacement you cannot cite; leave it out and say so.
- Never keep personal data the import does not use (birth dates, occupations from official registers).
