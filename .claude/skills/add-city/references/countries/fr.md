# France (realm `france`, opencouncil.fr, language `fr`)

Checked 2026-10-12 on Rouen (55 seats) and the Rennes demo (61 seats). Term: 2026–2032; elected 15/22 March 2026, councils installed in the following week. Roster: a `bodies` roster for `scripts/payload.ts` (its header shows the shape).

## Bodies
- **Conseil municipal** (`council`): the only body that decides. The mayor is a councillor and presides it; there is no separate presidium. The «secrétaire de séance» is chosen for each sitting — not a role.
- «Commissions municipales» only prepare business: not imported. «Conseils de quartier»: not imported.
- The Métropole / intercommunalité (e.g. Métropole Rouen Normandie, Rennes Métropole) is a separate authority: its roles («vice-président», «conseiller métropolitain») are not imported with the city.

## Sources, in order of trust
1. **Installation minutes** (procès-verbal of the first sitting, published with a later sitting): the mayor's election, the number of adjoints, the adjoint list, and «Constitution des groupes d'élus» — each group's exact name, size and (co)president. Rouen: annex 0-1 of 30/04/2026.
2. **The city's composition page** (Rouen `rouen.fr/composition-cm`; Rennes `metropole.rennes.fr/annuaire-des-elus/…`): mayor, adjoints in rank with gender («1re adjointe») and delegation, conseillers municipaux délégués with their delegation, other councillors, and each person's group. Gives accents.
3. **RNE** — Répertoire national des élus, data.gouv.fr dataset `repertoire-national-des-elus-1`, file `elus-conseillers-municipaux-cm.csv`, filter `Code de la commune` = INSEE code: name, sex, mandate start (election day), function («Maire», «Nème adjoint au Maire») and function start (installation day). Quarterly; it can miss a member (Rouen: Bruno Devaux absent on 2026-08-11) and spells some first names differently (Thibault/Thibaut). No group, no delegations. Use it for sex and dates, never as the roster. It also holds birth date and occupation: do not keep them.
4. **Election results** (resultats-elections.interieur.gouv.fr, data.gouv.fr): lists and seats. Lists are not groups: a winning list usually splits into several groups (Rouen: 1 list → 3 groups; Rennes: «Rennes Solidaire» → 4 groups).
- Later changes: a resignation or a replacement is announced at the next sitting («installation de M. X en remplacement de…») — search the sitting minutes and the decision titles.

## Roles (OpenCouncil mapping)
| Local function | OpenCouncil role | Title (as written) | Date |
|---|---|---|---|
| Maire | city role, `isHead` | «Maire» / «Mayor» | installation day |
| Adjoint(e) au maire | city role | «1re adjointe chargée de …», «2e adjoint chargé de …» — rank, gender and the delegation in the city's wording | installation day (RNE «Date de début de la fonction») |
| Conseiller(ère) municipal(e) délégué(e) | city role | «Conseillère municipale déléguée : <delegation as printed>» | the mayor's arrêté if found, else none |
| Conseiller(ère) municipal(e) | council membership only | — (no redundant city role; Rennes has one, do not copy it) | none |
| Président(e) / coprésident(e) de groupe | party role, `isHead` | «Président du groupe», «Coprésidente du groupe» / «Group president», «Group co-president» | none |
- Every councillor, the mayor included, is a member of the council (`electedOrder` = the official order: mayor, adjoints by rank, délégués, other majority, then the opposition by group).
- Parties = **groups** with their official names from the installation minutes; `name_short` = the usual short name; colours are placeholders unless the group publishes one.
- Ordinals: «1re»/«1er», then «2e», «3e» … (not «2ème»); English «1st Deputy Mayor for …».

## Names
- «Prénom Nom», surname in title case; particles «de», «du», «des» lower case (Matthieu de Montchalin); «Le», «La», «El», «Da» capitalised (Le Duey, El Khili, Da Silva).
- Hyphens from the minutes (ALAZARD-SCHNEIDER), accents from the composition page (minutes and RNE drop accents on capitals). `name_en` = `name`.

## Meetings
- **Agenda — the law**: the convocation states the agenda and is sent 5 clear days ahead (≥3,500 inhabitants, with a «note explicative de synthèse» for councillors), but it only has to be «affichée ou publiée» (CGCT L2121-10) — a notice at the town hall is enough. Online, the law requires only the list of adopted délibérations (within a week) and the procès-verbal (since 1 July 2022). So a city may publish no agenda document: find what it does publish.
- **Agenda — where cities publish it** (checked 2026-10-12): a PDF «ordre du jour» (Tours 12 days ahead `tours.fr/app/uploads/…/ordre-du-jour-du-<date>.pdf`; Bordeaux 7 days `bordeaux.fr/actes/recherche?type=72`; Lille `…/<YYYYMMDD>_CM_ORDRE DU JOUR.pdf`; Rennes `OJ_CM_dd_mm_yy.pdf` from its council page; Amiens a page per sitting; Caen PDF + Webdelib+ `/Villewebdelibplus/jsp/seance_agenda.jsp`); an HTML agenda with one draft per item (Le Havre `deliberations.lehavre.fr/seance.php?…`, 5 days ahead); a JavaScript portal (Nantes «Arcade», agenda 10 days, drafts 5 days ahead); or **the sitting page itself** (Rouen). No national platform; the open-data standard SCDL «Délibérations» holds adopted acts only (for past sittings, not agendas).
- **Rouen**: the sitting page `/fr/deliberation/<YYYY-MM-DD>` is the agenda and the projets de délibération (the city's own Facebook post says so; the decision pages carry the draft text, no result). Numbers are «<rapporteur>-<rank in the sitting>»: the rapporteur part is the rank in the council (0 the mayor, 1–14 the adjoints, 15+ délégués); the rank runs 0..N-1 in the order of the sitting (0 = approval of the previous minutes). The page groups items by rapporteur: build the agenda PDF in the order of the rank, keep the city's numbers, name the source page. processAgenda takes the rank as the item number, so subjects start at 0.
- A sitting can take an item added after the page was published, and the page may never be updated (Rouen 08/10/2026: «délibération numéro 55», a subsidy presented by the 1re adjointe, debated first; the page lists 0–54 and `1-55` is 404). The mayor calls items by the rank («délibération numéro 2» = «7-2»). Check the transcript for a «numéro» above the last rank before summarize, and decide whether to add it to the agenda.
- Sittings list: Rouen `rouen.fr/seances-conseil-municipal` → one page per sitting `/fr/deliberation/<YYYY-MM-DD>` listing every decision by rapporteur («7-1») and embedding the video. That page is the agenda (HTML → PDF with chromium). Not every sitting is listed (Rouen 05/06/2026 is only on YouTube).
- Video: live on Facebook, and uploaded to the city's YouTube channel (`/videos`, not `/streams`) weeks later (Rouen 25/06/2026 → uploaded 23/07). **Take the newest sitting**, so usually the Facebook live:
  - yt-dlp cannot list a Facebook page; open `facebook.com/<page>/videos` in the built-in browser (decline optional cookies, no login) and find «Séance du Conseil Municipal du …». yt-dlp then reads each video URL without a login, with its start time (`timestamp`) and duration.
  - A live can be split into parts — most likely Facebook Live's 8-hour broadcast limit: Rouen 08/10/2026 ran 13:55 for exactly 8 h 00 min, then 21:58 for 27 min. Join them: same-format downloads (`-f "bv*[height<=720][ext=mp4]+ba[ext=m4a]"`), then `ffmpeg -f concat`, re-encoded when a stream starts late (SKILL.md step 7: Rouen's parts started 2.4 s late and a stream copy put Mux out of sync). A meeting holds one video: join the parts into one mp4 on our Spaces (SKILL.md step 7, Video) before creating the meeting, or say which part is missing.
  - A YouTube upload has no stream start: take the sitting time from the page or the minutes.
- Meeting title: the site shows «Séance DD/MM/YYYY». Kind, urgency and session number are Greek fields: leave them out of `create_meeting`.
- YouTube search words: «conseil municipal <ville>», «séance du conseil municipal».
- Time zone Europe/Paris: offset +02:00 in summer, +01:00 in winter.

## Boundary and logo
- Boundary: `https://geo.api.gouv.fr/communes/<INSEE>?format=geojson&geometry=contour&fields=nom,code,population,surface` (IGN Admin Express, WGS84). `surface` is in hectares: compare it with the polygon's area. Rouen: 599 points, 21.34 km² vs 2,138 ha. The Rennes demo's boundary (712 km²) is Rennes Métropole, not the commune.
- Logo: the city's graphic charter page usually states the rules (Rouen `rouen.fr/fr/charte`: prior agreement of the communication department, no modification) — then do not add it without that agreement. The header logo of the site (Rouen `/themes/city/logo.svg`) is the official artwork once use is allowed.

## Decisions (pollDecisions)
- No national portal like Diavgeia: each city publishes its own decisions («actes», «délibérations») on its site, one page or PDF per decision, plus the sitting's procès-verbal.
- Minutes record votes **by group** («41 voix pour : groupe Fiers de Rouen, …», «4 élus ne prennent pas part au vote : groupe Rouen insoumise») and proxies («pouvoirs»): neither has a field in the Greek conventions form.
- pollDecisions does not apply until a French decision source exists in the task server.
