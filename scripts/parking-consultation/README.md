# Parking-consultation pipeline (Δήμος Παπάγου-Χολαργού, ΣΕΣ)

Turns the municipality's controlled-parking files into the data behind the consultation:

- `inputs/p1.dxf` (Π1, resident zones) and `inputs/p2.dxf` (Π2, parking organisation) — the
  AutoCAD drawings, converted from the delivered DWG files. They are drawn in ΕΓΣΑ87 metres, so
  no georeferencing is needed, and every category is a layer.
- `inputs/report.docx` — the technical report.
- `inputs/p1.pdf` and `inputs/p2.pdf` — the plots of the same drawings. They are only read with
  `--source pdf`, when no DWG is available (see "The PDF source" below).

It emits, in `data/` (committed, WGS84):

- `units.geojson` — one feature per **block side**: the strips of one category (residents, paid,
  motorcycles, excluded) on one side of a street between two cross-streets. Properties: `id`,
  `street`, `from`, `to`, `side` (`l`/`r` when travelling from `from` to `to`), `zone`, `lengthM`,
  `spots` with `spotsSource` (`drawing` when the plan writes the count next to the strip, else
  `estimate`), `calmTraffic`, `excludedReason`.
- `spots.geojson` — ΑΜΕΑ, charging, pharmacy and special spots as points, with the report's
  wording when a table row matched (`address`, `nSpots`, `note`).
- `zones.geojson` — the resident zones as areas: the street-network blocks inside the study
  boundary, each assigned to the zone drawn along its streets.
- `report.generated.json` — the report as chapters and articles of markdown, plus its tables.
- `manifest.json` — id → summary, used to diff re-runs.

`scripts/generate-parking-regulation.ts` then assembles the regulation JSON the app reads.

## Setup

```bash
cd scripts/parking-consultation
/opt/homebrew/bin/python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
brew install libredwg          # dwg2dxf, to convert the DWG drawings
```

## Run

```bash
cp ~/Downloads/"ΤΕΧΝΙΚΗ ΕΚΘΕΣΗ ΕΠΕΚΤΑΣΗ_2026.10.07_v2.docx" inputs/report.docx
dwg2dxf -o inputs/p1.dxf ~/Downloads/"Π1_ΖΩΝΕΣ ΕΛΕΓΧΟΜΕΝΗΣ ΣΤΑΘΜΕΥΣΗΣ_v2.dwg"
dwg2dxf -o inputs/p2.dxf ~/Downloads/"Π2_ΕΠΕΚΤΑΣΗΣ ΣΕΣ_v2.dwg"
.venv/bin/python -m ses all            # offline
open out/overlay-units.png out/overlay-zones.png out/diff-report.md
cd ../.. && npm run generate-parking-regulation -- --public
```

`all` converts the report, reads the drawings, builds units, spots and zones, and writes the
data plus two overlay PNGs to eyeball. It prints a sanity table; expect roughly:

| Check | Expected |
|---|---|
| dxf shapes | ≈ 590 residents / 112 paid / 67 motorcycles / 11 excluded; 21 shared ΑΜΕΑ, 37 dedicated, 7 charging, 16 special |
| units | ≈ 340, orphan strips 0 |
| spot counts from the drawing | ≈ 680 numbers placed, under 20 unplaced, under 10 units estimated |
| zones | one polygon each, 100 % of the pieces inside |
| address tables | every pharmacy row matched; a few ΑΜΕΑ rows with landmark hints stay unmatched |
| spots per category | within ±3 % of `reportTotals` in `config/consultation.json` (1832 / 550 / 516) |

`--strict` stops when an id listed in `data/manifest.launched.json` disappears.

## How the drawings are read

`config/dxf.json` names the layers. On Π2 a parking strip is an open polyline with a constant
width (3 m) along the kerb, which the reader buffers into the band the plot shows; a spot bay is
a solid hatch; `ΠΡΟΣΦΟΡΑ ΣΤΑΘΜΕΥΣΗΣ_ΑΡΙΘΜΗΣΗ` holds the spot count of each strip as a text next to
it, and `ταχυδρομικη αριθμηση` holds the house numbers. On Π1 each zone is a solid hatch of its
streets, kerb to kerb, and `PERIOXH MELETHS` is the study boundary. Hatch boundaries with arcs are
flattened. Entities far outside `frame` (the title block, the 1977 plan blocks) are dropped.

- A unit's `spots` is the sum of the count texts within `countSnapM` of it; a unit without one is
  estimated from its area with `spotAreaM2`.
- A zone hatch is cut along the OSM centrelines, so each piece lies in the block it colours. A
  block takes the zone with the largest piece area in it; a block inside the boundary with no
  piece (a square, a block with paid parking only) joins the nearest zone; the result is clipped
  to the boundary.
- The report's address tables give the spots their counts and wording. A row with a house number
  is placed by the house numbers drawn on Π2 (nearest row-spot pair first); other rows match by
  cross-street. The pharmacies table turns the special spots it names into the `pharmacies`
  category; `specialSpots` in `config/consultation.json` describes the rest (TAXI, the school).

## The PDF source

`--source pdf` reads `inputs/p1.pdf` and `inputs/p2.pdf` instead: the plots have no coordinate
grid, so a similarity transform (rotation, scale, translation) is fitted per sheet by minimising
the distance from each street label to that street's OpenStreetMap centreline, the filled shapes
are read by colour (`config/sheets.json`), and the triangles AutoCAD plots for one strip are
joined. Its spot counts are estimates. The georeferencing lands within a few metres; the DXF is
exact, so prefer it.

## Stable ids

A comment references an id, so ids must survive a re-run:

- unit: `{res|paid|moto|excl}-{street}-{from}-{to}-{l|r}`, street names transliterated
  deterministically (`ses/text.py`, locked by `tests/test_text.py`), `from`/`to` in a canonical
  direction (eastward; northward on near-ties), collisions suffixed `-2`, `-3` by position.
- spot: `{amea|amea-ix|ev|pharmacy|special}-{street}-{nearest cross-street}`.
- `config/id-aliases.json` maps a new id to the old one when a unit is renamed (a re-drawn block,
  a changed OSM street name). `out/diff-report.md` lists likely renames ready to paste.
- After launch, copy `data/manifest.json` to `data/manifest.launched.json` and run with `--strict`.

## Configuration

- `config/dxf.json` — the DXF files, the ΕΓΣΑ87 frame, layer → category, the zone and boundary
  layers, the count and house-number layers.
- `config/sheets.json` — the PDF plots: file per sheet, the map area (`mapXMax`), fill colour →
  category.
- `config/street-aliases.json` — every spelling of a street name (report, drawing, OSM variants
  such as Ψαρρών, Φωκαιω, Νικοδήμειας, Βιτάλη) → one canonical name.
- `config/consultation.json` — the public folder, the report's totals, the per-spot area for
  estimates, the special spots the report describes in prose, and everything the generator needs.
- `data/osm-ways.json` — a committed OpenStreetMap snapshot (`fetch-osm` refreshes it; ids depend on
  OSM names, so refresh deliberately and read the diff).

## Known limits

- The drawing shows fewer charging spots (6 locations, 7 bays) than the report counts (9). The
  pipeline reports what is drawn.
- The drawing's resident counts add up to about 3 % more than the report's total (1884 vs 1832).
- ΑΜΕΑ rows that name a landmark instead of a cross-street ("Νοσ. Γ. Γεννηματάς", "ΕΚΑΒ") and the
  rows on the squares stay unmatched; those spots keep the bay count drawn.

## Tests

```bash
.venv/bin/pytest
```
