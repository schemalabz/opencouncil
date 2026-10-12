"""Command line: `python -m ses <command>` from scripts/parking-consultation."""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

from .diff import diff_manifests, write_report as write_diff_report
from .docx_convert import convert_docx, write_report as write_docx_report
from .dxf import boundary_polygon, count_texts, labelled_points, layer_shapes, open_sheet, split_by_lines, texts
from .geojson_io import write_features
from .georef import Similarity, fit_similarity
from .ids import assign_spot_ids, assign_unit_ids, check_unique
from .osm import StreetIndex, fetch_ways, load_ways
from .overlay import render_overlay
from .pdf import extract_filled_shapes, extract_labels, open_page
from .segments import segments_from_table, units_on_segment
from .spots import apply_table_counts, cluster_spots, label_spots, name_spots
from .units import attach_counts, build_units, estimated_spots, join_plot_fragments, mark_calm_traffic
from .zones import GREEK_LETTER, assign_zones, build_zone_polygons, validate_zones

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent.parent
UNIT_CATEGORIES = ("residents", "paid", "motorcycles", "excluded")
COUNTED_CATEGORIES = ("residents", "paid", "motorcycles")
SPOT_CATEGORIES = ("amea_shared", "amea_dedicated", "ev", "special")
MIN_SHAPE_AREA_M2 = 0.5


@dataclass
class Extraction:
    """What a source (the PDF plots or the DXF drawings) yields, in ΕΓΣΑ87."""
    unit_shapes: dict[str, list[Polygon]]
    spot_shapes: dict[str, list[Polygon]]
    zone_strips: dict[str, list[Polygon]]
    letters: list[str]
    source: str
    boundary: Polygon | None = None
    calm: list[Polygon] = field(default_factory=list)
    counts: list[tuple[tuple[str, ...], list[tuple[int, Point]]]] = field(default_factory=list)  # (categories the layer counts, its numbers)
    count_snap_m: float = 1.5
    house_numbers: list[tuple[str, Point]] = field(default_factory=list)
    labels: list[tuple[str, Point]] = field(default_factory=list)


def load_json(relative: str, default=None):
    path = ROOT / relative
    if not path.exists():
        if default is not None:
            return default
        raise SystemExit(f"missing {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    return {k: v for k, v in data.items() if not k.startswith("_")} if isinstance(data, dict) else data


def street_index() -> StreetIndex:
    return StreetIndex(load_ways(ROOT / "data/osm-ways.json"), load_json("config/street-aliases.json"))


def georef_sheet(key: str, sheet: dict, streets: StreetIndex, refit: bool) -> Similarity:
    path = ROOT / f"data/georef-{key}.json"
    page = open_page(str(ROOT / sheet["file"]))
    if path.exists() and not refit:
        return Similarity.from_dict(json.loads(path.read_text(encoding="utf-8"))["transform"])
    similarity, stats = fit_similarity(extract_labels(page, sheet), streets)
    print(f"georef {key}: kept {stats['kept']}/{stats['matched']} labels, median {stats['median_m']} m, rms {stats['rms_m']} m, "
          f"scale {stats['scale_m_per_pt']} m/pt, rotation {stats['rotation_deg']}°")
    path.write_text(json.dumps({"transform": similarity.to_dict(), "stats": {k: v for k, v in stats.items() if k != "dropped"}}, indent=2) + "\n", encoding="utf-8")
    return similarity


def sheet_polygons(sheet: dict, transform) -> dict[str, list[Polygon]]:
    page = open_page(str(ROOT / sheet["file"]))
    shapes, unknown = extract_filled_shapes(page, sheet)
    loud = [(colour, n) for colour, n in unknown.items() if n > 20]
    if loud:
        raise SystemExit(f"{sheet['file']}: filled colours not mapped in config/sheets.json: {loud}. The sheet changed; map or ignore them.")
    polygons: dict[str, list[Polygon]] = {}
    for category, paths in shapes.items():
        cleaned = []
        for rings in paths:
            # One path is one drawn object: its triangles together make the shape.
            polygon = unary_union([Polygon([transform.apply(x, y) for x, y in ring]).buffer(0) for ring in rings])
            if polygon.is_empty:
                continue
            parts = polygon.geoms if polygon.geom_type == "MultiPolygon" else [polygon]
            cleaned.extend(p for p in parts if p.area >= MIN_SHAPE_AREA_M2)
        polygons[category] = cleaned
    return polygons


def cmd_fetch_osm(args) -> None:
    bbox = tuple(load_json("config/sheets.json")["bbox"])
    count = fetch_ways(bbox, ROOT / "data/osm-ways.json")
    print(f"snapshot: {count} named ways in {bbox}")


def cmd_docx(args) -> None:
    consultation = load_json("config/consultation.json")
    # The figures are uploaded by hand to `figuresBaseUrl`; the repository holds no consultation files.
    figures_dir = ROOT / "out/figures"
    report = convert_docx(ROOT / "inputs/report.docx", figures_dir, consultation["figuresBaseUrl"].rstrip("/"))
    write_docx_report(report, ROOT / "data/report.generated.json")
    print(f"report: {len(report['chapters'])} chapters, {sum(len(c['articles']) for c in report['chapters'])} articles, "
          f"{len(report['tables'])} tables, figures in {figures_dir}")
    for anomaly in report["anomalies"]:
        print("  anomaly:", anomaly)


def extract_pdf(args, streets: StreetIndex) -> Extraction:
    sheets = load_json("config/sheets.json")["sheets"]
    transforms = {key: georef_sheet(key, sheet, streets, args.refit) for key, sheet in sheets.items()}
    p1 = sheet_polygons(sheets["p1"], transforms["p1"])
    p2 = sheet_polygons(sheets["p2"], transforms["p2"])
    letters = sorted(category[len("zone_"):] for category in sheets["p1"]["fills"].values() if category.startswith("zone_"))
    zone_strips = {letter: p1.get(f"zone_{letter}", []) for letter in letters}
    print("strips:", {c: len(p2.get(c, [])) for c in UNIT_CATEGORIES}, "zone strips:", {k: len(v) for k, v in zone_strips.items()})
    strips = {c: join_plot_fragments(p2.get(c, [])) for c in UNIT_CATEGORIES}
    print("strips joined from plot fragments:", {c: len(v) for c, v in strips.items()})
    return Extraction(strips, {c: p2.get(c, []) for c in SPOT_CATEGORIES}, zone_strips, letters, "pdf")


def extract_dxf(streets: StreetIndex) -> Extraction:
    config = load_json("config/dxf.json")
    frame, flatten = config["frame"], config.get("flattenM", 0.2)
    p1_config, p2_config = config["sheets"]["p1"], config["sheets"]["p2"]
    p1 = open_sheet(ROOT / p1_config["file"], frame, flatten)
    p2 = open_sheet(ROOT / p2_config["file"], frame, flatten)

    zone_shapes = layer_shapes(p1, p1_config["zones"])
    # Π1 draws a zone kerb to kerb. Cut along the centrelines, so each piece sits in the block it colours.
    zone_strips = {letter: split_by_lines(shapes, streets.lines) for letter, shapes in zone_shapes.items()}
    boundary = boundary_polygon(p1, p1_config["boundary"]) if p1_config.get("boundary") else None

    shapes = layer_shapes(p2, p2_config["layers"])
    calm = layer_shapes(p2, {p2_config["calmLayer"]: "calm"})["calm"] if p2_config.get("calmLayer") else []
    counts = [(tuple(categories), count_texts(p2, [layer])) for layer, categories in p2_config.get("countLayers", {}).items()]
    house_numbers = texts(p2, {p2_config["houseNumberLayer"]}) if p2_config.get("houseNumberLayer") else []
    labels = labelled_points(p2, p2_config.get("spotLabels", {}))
    print("dxf shapes:", {c: len(v) for c, v in shapes.items()}, "zone pieces:", {k: len(v) for k, v in zone_strips.items()},
          f"boundary {boundary.area / 1e6:.2f} km²" if boundary is not None else "no boundary",
          f"| {sum(len(c) for _, c in counts)} spot counts, {len(house_numbers)} house numbers, {len(labels)} labels, {len(calm)} calm-street shapes")
    for sheet, name in ((p1, "p1"), (p2, "p2")):
        if sheet.stats:
            print(f"  {name} skipped:", dict(sheet.stats))
    return Extraction({c: shapes.get(c, []) for c in UNIT_CATEGORIES}, {c: shapes.get(c, []) for c in SPOT_CATEGORIES}, zone_strips, sorted(zone_shapes), "dxf",
                      boundary, calm, counts, config.get("countSnapM", 1.5), house_numbers, labels)


def cmd_build(args) -> None:
    consultation = load_json("config/consultation.json")
    id_aliases = load_json("config/id-aliases.json", default={})
    streets = street_index()
    source = args.source or ("dxf" if (ROOT / "config/dxf.json").exists() else "pdf")
    extracted = extract_dxf(streets) if source == "dxf" else extract_pdf(args, streets)

    units, orphans = build_units(extracted.unit_shapes, streets, max_way_distance=args.max_way_distance)
    print("units:", dict(Counter(u.category for u in units)), f"total {len(units)}, orphan strips {len(orphans)}")
    for category, polygon in orphans[:10]:
        print(f"  orphan {category} near ΕΓΣΑ87 {polygon.centroid.x:.0f},{polygon.centroid.y:.0f}")
    if extracted.counts:
        unmatched = []
        for categories, counts in extracted.counts:
            unmatched += attach_counts(units, counts, categories, extracted.count_snap_m)
        uncounted = [u for u in units if u.category in COUNTED_CATEGORIES and u.spots is None]
        total = sum(len(counts) for _, counts in extracted.counts)
        print(f"spot counts from the drawing: {total - len(unmatched)} numbers placed, {len(unmatched)} without a strip within {extracted.count_snap_m} m, "
              f"{len(uncounted)} counted units without a number (estimated instead)")
        for value, point in unmatched[:10]:
            print(f"  unplaced count {value} at ΕΓΣΑ87 {point.x:.0f},{point.y:.0f}")
        for unit in uncounted[:10]:
            print(f"  no count: {unit.category} {unit.street} {unit.from_cross}–{unit.to_cross} {unit.side} ({unit.length_m} m)")
    if extracted.calm:
        print("calm-traffic units from the drawing:", mark_calm_traffic(units, extracted.calm))

    spots = []
    for category in SPOT_CATEGORIES:
        spots.extend(cluster_spots(category, extracted.spot_shapes.get(category, [])))
    name_spots(spots, streets)
    label_spots(spots, extracted.labels)

    zone_options = {"weight": "area", "min_weight": 1.0, "boundary": extracted.boundary} if extracted.source == "dxf" else {}
    zones, zone_build = build_zone_polygons(streets, extracted.zone_strips, **zone_options)
    stats, problems = validate_zones(zones, extracted.zone_strips)
    print("zone blocks:", zone_build)
    for letter, info in stats.items():
        print(f"zone {GREEK_LETTER[letter]}: {info}")
    for problem in problems:
        print("  zone problem:", problem)
    if len(zones) < len(extracted.letters):
        raise SystemExit("not every zone polygon could be built; fix the aliases or the boundary list")
    # A wrong zone tells residents the wrong resident card, so the build stops before it writes one.
    if problems and not args.allow_zone_problems:
        # Draw the zones over their Π1 strips first, so the stop comes with the picture that explains it.
        render_overlay(ROOT / "out/overlay-zones.png", streets, [(f"zone_{letter}", strip) for letter, strips in extracted.zone_strips.items() for strip in strips], list(zones.values()))
        raise SystemExit(
            f"{len(problems)} zone problem(s) above; see out/overlay-zones.png. The zones follow the Π1 strips "
            "and the street blocks, so check config/street-aliases.json and the Π1 drawing. "
            "To write the data anyway, rerun with --allow-zone-problems."
        )
    assign_zones(units, extracted.zone_strips, zones)
    print("unit zones:", dict(Counter(f"{u.zone}/{u.zone_source}" for u in units)))

    house_numbers = extracted.house_numbers or None
    report_path = ROOT / "data/report.generated.json"
    if report_path.exists():
        report = json.loads(report_path.read_text(encoding="utf-8"))
        # Spot counts and wording from the report's address tables: the shared ΑΜΕΑ table (§4.4) names
        # locations by cross-street, the dedicated one (§3.3) and the pharmacies (§3.4) by house number.
        # A pharmacy stays a special spot, as the municipality counts it; the table gives it its note.
        for table in report["tables"]:
            title = table.get("title") or ""
            if "ΦΑΡΜΑΚΕΙ" in title:
                category, note = "special", consultation.get("pharmacyNote")
            elif "ΑΜΕΑ" in title:
                category, note = ("amea_dedicated" if "ΕΙΔΙΚΕΣ" in title else "amea_shared"), None
            else:
                continue
            rows = [[*row[:2], note] if note and len(row) >= 2 else row for row in table["rows"]]
            unmatched = apply_table_counts([s for s in spots if s.category == category], rows, streets, house_numbers)
            print(f"table '{title}': {len(table['rows']) - len(unmatched)} rows matched a {category} spot; unmatched: {unmatched}")
        for table in report["tables"]:
            title = (table.get("title") or "") + " " + " ".join(table.get("header", []))
            if re.search(r"ΗΠΙΑΣ ΚΥΚΛΟΦΟΡΙΑΣ", title):
                attribute = "calm_traffic"
            elif re.search(r"ΕΞΑΙΡΟΥΝΤΑΙ", title):
                attribute = "excluded_reason"
            else:
                continue
            for segment in segments_from_table(table):
                matched, reason = units_on_segment(segment, units, streets)
                if reason:
                    print(f"  table '{attribute}': {reason}")
                for unit in matched:
                    if attribute == "calm_traffic":
                        unit.calm_traffic = True
                    else:
                        unit.excluded_reason = segment.note
        print("calm-traffic units:", sum(1 for u in units if u.calm_traffic), "excluded with reason:", sum(1 for u in units if u.excluded_reason))
    else:
        print("no data/report.generated.json yet: run `docx` to mark calm-traffic and excluded segments")
    # Special spots the report describes in prose, not in a table: the config repeats them as rows,
    # by address or by the word the drawing writes on them ("TAXI").
    special = [s for s in spots if s.category == "special"]
    for row in consultation.get("specialSpots", []):
        if "label" in row:
            for spot in special:
                if spot.label == row["label"]:
                    spot.n_spots, spot.note = int(row["count"]), row.get("note")
    special_rows = [[row["address"], str(row["count"]), row.get("note", "")] for row in consultation.get("specialSpots", []) if "address" in row]
    if special_rows:
        unmatched = apply_table_counts(special, special_rows, streets, house_numbers)
        print(f"config specialSpots: {len(special_rows) - len(unmatched)} addresses matched; unmatched: {unmatched}")
    print("spots:", {c: (sum(1 for s in spots if s.category == c), sum(s.n_spots for s in spots if s.category == c)) for c in SPOT_CATEGORIES}, "(locations, spots)")

    assign_unit_ids(units, id_aliases)
    assign_spot_ids(spots, id_aliases)
    duplicates = check_unique([u.id for u in units] + [s.id for s in spots])
    if duplicates:
        raise SystemExit(f"duplicate ids: {duplicates}")

    spot_area = consultation["spotAreaM2"]
    manifest = {}
    unit_features = []
    for unit in units:
        centroid = unit.geometry.centroid
        properties = {
            "id": unit.id, "category": unit.category, "street": unit.street, "from": unit.from_cross, "to": unit.to_cross, "side": unit.side,
            "zone": unit.zone, "zoneSource": unit.zone_source, "lengthM": unit.length_m,
            "spots": unit.spots if unit.spots is not None else estimated_spots(unit, spot_area), "spotsSource": "drawing" if unit.spots is not None else "estimate",
            "calmTraffic": unit.calm_traffic, "excludedReason": unit.excluded_reason, "strips": len(unit.strips),
        }
        unit_features.append((unit.geometry, properties))
        manifest[unit.id] = {"category": unit.category, "street": unit.street, "centroid": [round(centroid.x, 1), round(centroid.y, 1)], "lengthM": unit.length_m}
    spot_features = []
    for spot in spots:
        properties = {"id": spot.id, "category": spot.category, "street": spot.street, "cross": spot.cross, "address": spot.address, "note": spot.note, "nSpots": spot.n_spots, "parts": spot.parts}
        spot_features.append((spot.point, properties))
        manifest[spot.id] = {"category": spot.category, "street": spot.street, "centroid": [round(spot.point.x, 1), round(spot.point.y, 1)], "lengthM": 0}
    zone_features = [
        (polygon.simplify(0.5, preserve_topology=True), {"id": f"zone-{letter.lower()}", "letter": GREEK_LETTER[letter], "name": f"Ζώνη {GREEK_LETTER[letter]}", "strips": len(extracted.zone_strips[letter])})
        for letter, polygon in sorted(zones.items())
    ]

    manifest_path = ROOT / "data/manifest.json"
    launched_path = ROOT / "data/manifest.launched.json"
    for previous in (launched_path, manifest_path):
        if previous.exists():
            diff = diff_manifests(json.loads(previous.read_text(encoding="utf-8")), manifest)
            write_diff_report(diff, ROOT / "out/diff-report.md", previous.name)
            print(f"diff vs {previous.name}: +{len(diff['added'])} -{len(diff['removed'])} moved {len(diff['moved'])} renames {len(diff['renames'])} (out/diff-report.md)")
            if args.strict and previous == launched_path and diff["removed"]:
                raise SystemExit(f"--strict: ids from the launched consultation disappeared: {diff['removed'][:10]}")
            break

    write_features(ROOT / "data/units.geojson", unit_features)
    write_features(ROOT / "data/spots.geojson", spot_features)
    write_features(ROOT / "data/zones.geojson", zone_features)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    totals = Counter()
    for unit in units:
        totals[unit.category] += unit.spots if unit.spots is not None else estimated_spots(unit, spot_area)
    print("spots per category:", dict(totals), "(report:", consultation.get("reportTotals", {}), ")")

    render_overlay(ROOT / "out/overlay-units.png", streets, [(u.category, u.geometry) for u in units] + [(s.category, s.point) for s in spots], list(zones.values()))
    render_overlay(ROOT / "out/overlay-zones.png", streets, [(f"zone_{letter}", strip) for letter, strips in extracted.zone_strips.items() for strip in strips], list(zones.values()))
    print("wrote data/units.geojson, data/spots.geojson, data/zones.geojson, data/manifest.json, out/overlay-*.png")


def cmd_all(args) -> None:
    if (ROOT / "inputs/report.docx").exists():
        cmd_docx(args)
    cmd_build(args)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="ses", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("fetch-osm", help="download the OpenStreetMap snapshot (network)").set_defaults(func=cmd_fetch_osm)
    sub.add_parser("docx", help="convert the report to data/report.generated.json").set_defaults(func=cmd_docx)
    for name, func in (("build", cmd_build), ("all", cmd_all)):
        p = sub.add_parser(name, help="extract the drawings and write the GeoJSON data" + (" (after converting the report)" if name == "all" else ""))
        p.add_argument("--source", choices=("dxf", "pdf"), help="read the DXF drawings (default when config/dxf.json exists) or georeference the PDF plots")
        p.add_argument("--refit", action="store_true", help="PDF source: refit the georeferencing instead of reusing data/georef-*.json")
        p.add_argument("--strict", action="store_true", help="fail when an id from manifest.launched.json disappears")
        p.add_argument("--allow-zone-problems", action="store_true", help="write the zones even when validation reports problems (check the overlay first)")
        p.add_argument("--max-way-distance", type=float, default=45.0, help="metres from a street centreline within which a strip belongs to it (squares and dual carriageways need ~45)")
        p.set_defaults(func=func)
    args = parser.parse_args(argv)
    args.func(args)
