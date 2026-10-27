# The content language of a city

A city's `language` is the language its council speaks in meetings. It selects the speech recognition (ElevenLabs Scribe), the transcript corrections and the language of every summary. A wrong value gives a transcript in the wrong language and summaries that nobody in the city reads. Decide it before `create_city` from the law and the municipality's own documents, and show how you decided at the checkpoint. Do not try to judge it from the audio of a meeting: an agent cannot listen to one.

Researched 2026-10-27 for the nine countries of the realms added that month. Legal texts were read from the primary source unless the line says otherwise. Re-check a rule before you rely on it for a new region.

## Languages we can process

The values of `CityLanguage`: `el`, `fr`, `sr`, `de`, `nl`, `it`, `pl`, `pt`, `es`, `fi`, `ca` (Catalan, also Valencian), `sv`, `gl`. Each one has a configuration in the tasks backend (`opencouncil-tasks` `src/lib/language.ts`).

Scribe does not list Basque, West Frisian, Ladin, Sorbian, Sámi or Mirandese ([ElevenLabs speech-to-text languages](https://elevenlabs.io/docs/capabilities/speech-to-text)). A council that speaks one of these cannot get a correct transcript today.

## The rule for one municipality

1. Find the municipality's region in the table below. Not in a listed region ⇒ use the country default, and the language step ends.
2. In a listed region, use the official list the table names (the Finnish decree, the Valencian list, the Belgian language areas, the Basque-speaking municipalities) to place the municipality, and take the value the table gives.
3. Where the table says "check", read the evidence below. When it agrees with the table's value, use that value.
4. Stop and ask the user at the checkpoint when: the table says "stop and ask"; the language is not one we can process; the council is mixed (Brussels, the bilingual Finnish municipalities); or the evidence disagrees with the table. Give the user what you found, so that a person can decide, for example by watching a minute of a meeting or by asking the municipality.
5. Record in `sources.md` the rule, the list and the documents that decided the value.

| Country | Default | Regions to check |
|---|---|---|
| Germany | `de` | The Sorbian core municipalities in Saxony (Crostwitz, Ralbitz-Rosenthal, Panschwitz-Kuckau, Nebelschütz, Räckelwitz): check; Sorbian is not supported. |
| Austria | `de` | None. Croatian, Slovene and Hungarian are additional official languages for residents in the municipalities of the Volksgruppengesetz, Anlage 2; the council debates in German. |
| Poland | `pl` | None. An auxiliary language (German, Kashubian, Lithuanian, Belarusian, Lemko) is for residents' dealings with the gmina, not for the council debate. |
| Portugal | `pt` | None. Mirandese (Miranda do Douro) is not supported; the council meets in Portuguese. |
| Netherlands | `nl` | Friesland, except Ameland, Schiermonnikoog, Terschelling, Vlieland and Weststellingwerf: anyone may speak Frisian in the council (Wet gebruik Friese taal, art. 9), and Frisian is not supported. Stop and ask. |
| Belgium | none | The language area decides (Constitution art. 4; language laws of 18 July 1966, arts. 10, 17, 23). Flemish Region, the six periphery municipalities included: `nl`. Walloon Region: `fr`. The 9 German-speaking municipalities: `de`. The 19 Brussels municipalities: `fr` to start, but councillors may speak Dutch: a mixed council, so ask. |
| Finland | `fi` | Decree 1385/2022 lists the bilingual municipalities. 15 with a Swedish majority (Inkoo, Raasepori, Kemiönsaari, Parainen, Korsnäs, Kristiinankaupunki, Kruunupyy, Luoto, Maalahti, Mustasaari, Närpiö, Pedersören kunta, Pietarsaari, Uusikaarlepyy, Vöyri): `sv` to start, check. 18 with a Finnish majority (Helsinki, Espoo, Vantaa, Turku, Vaasa, Porvoo, Kokkola and others): `fi`, and report the Swedish speeches. Åland: `sv`. Members of a bilingual council may speak either language (Kielilaki § 28). |
| Spain | `es` | Catalonia and the Balearic Islands: `ca` to start, check (some councils debate in Spanish). Valencian Community: `es` for the municipalities of Castilian predominance (Llei 4/1983, art. 36); elsewhere check (`ca` or `es`). Galicia: check (`gl` or `es`); the minutes are in Galician by law whatever the debate. Basque Country, and Navarre's Basque-speaking zone: stop and ask (Basque is not supported). Navarre's other zones: `es`. Val d'Aran: stop and ask. |
| Italy | `it` | South Tyrol (Province of Bolzano): `de` to start for most municipalities; Bolzano city, Laives, Salorno, Bronzolo and other Italian-majority ones: check (`it` or `de`). The Ladin municipalities (Val Badia, Val Gardena, Val di Fassa): stop and ask. The Slovene-list municipalities of Friuli-Venezia Giulia: `it`, and report Slovene speeches. |

## Evidence, in order of weight

1. **The minutes and the agenda.** They show the language the municipality writes in. In Finland, Galicia, Catalonia, Friesland and Brussels the law fixes the language of the documents, not of the speech, so there they do not prove the debate language. Minutes that summarize speeches in two languages are a strong sign of a mixed council.
2. **Text about the meetings:** the titles and descriptions of the meeting videos, the language of the municipality's press releases about council meetings, local press reports of a sitting. Weak, but cheap.
3. **Interpretation.** A contract or a notice about simultaneous interpretation (Bilbao, Getxo, Koekelberg, Schaerbeek) means members speak both languages: a mixed council.
4. **The default language of the municipality's website.** It shows the administration, not the council floor: a reason to check, never a decision.

## Open points

- A mixed council (Brussels, Helsinki, Barcelona-area councils) has one stored language. Nobody has tested Scribe on a mixed meeting yet: a fixed language may damage the speeches in the other language. Onboard such a council only with a person's yes.
- The first transcript of a new city is the real test of its language: read part of it before summarize runs.
- Each new language's prompts in the tasks backend were written without a native speaker. A native speaker should read the first summaries of a city in that language.
