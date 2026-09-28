# Parking-consultation pipeline (Δήμος Παπάγου-Χολαργού, ΣΕΣ)

Turns the municipality's controlled-parking files into the data behind the consultation:

- `inputs/p1.pdf` (Π1, resident zones) and `inputs/p2.pdf` (Π2, parking organisation) — AutoCAD
  vector plots at 1:2000 with no coordinate grid.
- `inputs/report.docx` — the technical report.

It emits, in `data/` (committed, WGS84):

- `units.geojson` — one feature per **block side**: the strips of one category (residents, paid,
  motorcycles, excluded) on one side of a street between two cross-streets. Properties: `id`,
  `street`, `from`, `to`, `side` (`l`/`r` when travelling from `from` to `to`), `zone`, `lengthM`,
  `estSpots`, `calmTraffic`, `excludedReason`.
- `spots.geojson` — ΑΜΕΑ, charging and special spots as points, with the report's wording when a
  table row matched (`address`, `nSpots`).
- `zones.geojson` — the four resident zones as areas (unions of the street-network blocks that
  hold each zone's drawn strips).
- `report.generated.json` — the report as chapters and articles of markdown, plus its tables.
- `manifest.json` — id → summary, used to diff re-runs.

`scripts/generate-parking-regulation.ts` then assembles the regulation JSON the app reads.

## Setup

```bash
cd scripts/parking-consultation
/opt/homebrew/bin/python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Run

```bash
cp ~/Downloads/"ΤΕΧΝΙΚΗ ΕΚΘΕΣΗ ΕΠΕΚΤΑΣΗ_09-2026.docx" inputs/report.docx
cp ~/Downloads/"Π1_ΖΩΝΕΣ ΕΛΕΓΧΟΜΕΝΗΣ ΣΤΑΘΜΕΥΣΗΣ.pdf" inputs/p1.pdf
cp ~/Downloads/"Π2_ΕΠΕΚΤΑΣΗ ΣΕΣ.pdf" inputs/p2.pdf
.venv/bin/python -m ses all            # offline; add --refit after a re-plotted sheet
open out/overlay-units.png out/overlay-zones.png out/diff-report.md
cd ../.. && npm run generate-parking-regulation -- --public
```

`all` converts the report, georeferences both sheets (reusing `data/georef-*.json` unless
`--refit`), extracts the strips by fill colour, builds units, spots and zones, and writes the
data plus two overlay PNGs to eyeball. It prints a sanity table; expect roughly:

| Check | Expected |
|---|---|
| strips per category | ≈ 1023 / 225 / 110 / 50 |
| strips joined from plot fragments | ≈ 629 / 131 / 81 / 26 (AutoCAD plots one strip as several triangles) |
| units | ≈ 367, orphan strips 0 |
| spot locations | ≈ 15 shared ΑΜΕΑ, 15 dedicated, 6 charging, 3 special |
| zone coverage | ≥ 97 % of each zone's strips, one polygon each |
| estimated spots | within ±10 % of Table 4.4 (1910 / 491 / 519) |
| georef (with `--refit`) | median ≈ 3 m, scale ≈ 0.70 m/pt, rotation ≈ 38° |

`all` stops on a filled colour that `config/sheets.json` does not map (a re-plotted sheet), and
`--strict` stops when an id listed in `data/manifest.launched.json` disappears.

## How the georeferencing works

The sheet's street labels sit on the streets they name. A similarity transform (rotation, scale,
translation) is fitted by minimising the distance from each transformed label to that street's
OpenStreetMap centreline, with outlier rejection. Each sheet keeps its own transform. If the
municipality provides the DXF in ΕΓΣΑ87, extraction can read it directly and skip this step.

## Stable ids

A comment references an id, so ids must survive a re-run:

- unit: `{res|paid|moto|excl}-{street}-{from}-{to}-{l|r}`, street names transliterated
  deterministically (`ses/text.py`, locked by `tests/test_text.py`), `from`/`to` in a canonical
  direction (eastward; northward on near-ties), collisions suffixed `-2`, `-3` by position.
- spot: `{amea|amea-ix|ev|special}-{street}-{nearest cross-street}`.
- `config/id-aliases.json` maps a new id to the old one when a unit is renamed (a re-drawn block,
  a changed OSM street name). `out/diff-report.md` lists likely renames ready to paste.
- After launch, copy `data/manifest.json` to `data/manifest.launched.json` and run with `--strict`.

## Configuration

- `config/sheets.json` — file per sheet, the map area (`mapXMax`), fill colour → category.
- `config/street-aliases.json` — every spelling of a street name (report, drawing, OSM variants
  such as Ψαρρών, Φωκαιω, Νικοδήμειας) → one canonical name.
- `config/consultation.json` — the public figures folder and the per-spot area used for
  `estSpots` (calibrated to the report's totals).
- `data/osm-ways.json` — a committed OpenStreetMap snapshot (`fetch-osm` refreshes it; ids depend on
  OSM names, so refresh deliberately and read the diff).

## Known limits

- The drawing shows fewer charging spots (6 locations) than the report counts (15). The pipeline
  reports what is drawn.
- Dedicated ΑΜΕΑ rows name house numbers; only streets with a single row and a single drawn spot
  match. Others keep a count of 1.
- Spot counts per location come from the report's tables, not from the symbols (the symbols are
  glyph fragments, not bays).

## Tests

```bash
.venv/bin/pytest
```
