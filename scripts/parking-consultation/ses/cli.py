"""Command line: `python -m ses <command>` from scripts/parking-consultation."""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

from shapely.geometry import Polygon
from shapely.ops import unary_union

from .diff import diff_manifests, write_report as write_diff_report
from .docx_convert import convert_docx, write_report as write_docx_report
from .geojson_io import write_features
from .georef import Similarity, fit_similarity
from .ids import assign_spot_ids, assign_unit_ids, check_unique
from .osm import StreetIndex, fetch_ways, load_ways
from .overlay import render_overlay
from .pdf import extract_filled_shapes, extract_labels, open_page
from .segments import segments_from_table, units_on_segment
from .spots import apply_table_counts, cluster_spots, name_spots
from .units import build_units, estimated_spots, join_plot_fragments
from .zones import GREEK_LETTER, assign_zones, build_zone_polygons, validate_zones

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent.parent
UNIT_CATEGORIES = ("residents", "paid", "motorcycles", "excluded")
SPOT_CATEGORIES = ("amea_shared", "amea_dedicated", "ev", "special")
MIN_SHAPE_AREA_M2 = 0.5


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
    figures_dir = REPO / "public" / consultation["publicDir"]
    report = convert_docx(ROOT / "inputs/report.docx", figures_dir, "/" + consultation["publicDir"])
    write_docx_report(report, ROOT / "data/report.generated.json")
    print(f"report: {len(report['chapters'])} chapters, {sum(len(c['articles']) for c in report['chapters'])} articles, "
          f"{len(report['tables'])} tables, figures in {figures_dir}")
    for anomaly in report["anomalies"]:
        print("  anomaly:", anomaly)


def cmd_build(args) -> None:
    sheets = load_json("config/sheets.json")["sheets"]
    consultation = load_json("config/consultation.json")
    id_aliases = load_json("config/id-aliases.json", default={})
    streets = street_index()

    transforms = {key: georef_sheet(key, sheet, streets, args.refit) for key, sheet in sheets.items()}
    p1 = sheet_polygons(sheets["p1"], transforms["p1"])
    p2 = sheet_polygons(sheets["p2"], transforms["p2"])
    zone_strips = {letter: p1.get(f"zone_{letter}", []) for letter in GREEK_LETTER}
    print("strips:", {c: len(p2.get(c, [])) for c in UNIT_CATEGORIES}, "zone strips:", {k: len(v) for k, v in zone_strips.items()})

    strips = {c: join_plot_fragments(p2.get(c, [])) for c in UNIT_CATEGORIES}
    print("strips joined from plot fragments:", {c: len(v) for c, v in strips.items()})
    units, orphans = build_units(strips, streets, max_way_distance=args.max_way_distance)
    print("units:", dict(Counter(u.category for u in units)), f"total {len(units)}, orphan strips {len(orphans)}")
    for category, polygon in orphans[:10]:
        print(f"  orphan {category} near ΕΓΣΑ87 {polygon.centroid.x:.0f},{polygon.centroid.y:.0f}")

    spots = []
    for category in SPOT_CATEGORIES:
        spots.extend(cluster_spots(category, p2.get(category, [])))
    name_spots(spots, streets)
    print("spots:", {c: (sum(1 for s in spots if s.category == c), sum(s.n_spots for s in spots if s.category == c)) for c in SPOT_CATEGORIES}, "(locations, spots)")

    zones, zone_build = build_zone_polygons(streets, zone_strips)
    stats, problems = validate_zones(zones, zone_strips)
    print("zone blocks:", zone_build)
    for letter, info in stats.items():
        print(f"zone {GREEK_LETTER[letter]}: {info}")
    for problem in problems:
        print("  zone problem:", problem)
    if len(zones) < len(GREEK_LETTER):
        raise SystemExit("not every zone polygon could be built; fix the aliases or the boundary list")
    # A wrong zone tells residents the wrong resident card, so the build stops before it writes one.
    if problems and not args.allow_zone_problems:
        raise SystemExit(f"{len(problems)} zone problem(s) above; fix config/zone-streets.json or the aliases, or rerun with --allow-zone-problems after checking out/overlay-p1.png")
    assign_zones(units, zone_strips, zones)
    print("unit zones:", dict(Counter(f"{u.zone}/{u.zone_source}" for u in units)))

    report_path = ROOT / "data/report.generated.json"
    if report_path.exists():
        report = json.loads(report_path.read_text(encoding="utf-8"))
        # Spot counts: the shared ΑΜΕΑ table (§4.4) names locations by cross-street, the dedicated
        # one (§3.3) by house number. Both feed the same matcher; unmatched rows are printed.
        for table in report["tables"]:
            title = table.get("title") or ""
            if "ΑΜΕΑ" not in title:
                continue
            category = "amea_dedicated" if "ΕΙΔΙΚΕΣ" in title else "amea_shared"
            unmatched = apply_table_counts([s for s in spots if s.category == category], table["rows"], streets)
            print(f"table '{title}': {len(table['rows']) - len(unmatched) - 1} rows matched a {category} spot; unmatched: {unmatched}")
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
            "zone": unit.zone, "zoneSource": unit.zone_source, "lengthM": unit.length_m, "estSpots": estimated_spots(unit, spot_area),
            "calmTraffic": unit.calm_traffic, "excludedReason": unit.excluded_reason, "strips": len(unit.strips),
        }
        unit_features.append((unit.geometry, properties))
        manifest[unit.id] = {"category": unit.category, "street": unit.street, "centroid": [round(centroid.x, 1), round(centroid.y, 1)], "lengthM": unit.length_m}
    spot_features = []
    for spot in spots:
        properties = {"id": spot.id, "category": spot.category, "street": spot.street, "cross": spot.cross, "address": spot.address, "nSpots": spot.n_spots, "parts": spot.parts}
        spot_features.append((spot.point, properties))
        manifest[spot.id] = {"category": spot.category, "street": spot.street, "centroid": [round(spot.point.x, 1), round(spot.point.y, 1)], "lengthM": 0}
    zone_features = [
        (polygon.simplify(0.5, preserve_topology=True), {"id": f"zone-{letter.lower()}", "letter": GREEK_LETTER[letter], "name": f"Ζώνη {GREEK_LETTER[letter]}", "strips": len(zone_strips[letter])})
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
        totals[unit.category] += estimated_spots(unit, spot_area)
    print("estimated spots:", dict(totals), "(report Table 4.4: residents 1910, visitors 491, motorcycles 519)")

    render_overlay(ROOT / "out/overlay-units.png", streets, [(u.category, u.geometry) for u in units] + [(s.category, s.point) for s in spots], list(zones.values()))
    render_overlay(ROOT / "out/overlay-zones.png", streets, [(f"zone_{letter}", strip) for letter, strips in zone_strips.items() for strip in strips], list(zones.values()))
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
        p = sub.add_parser(name, help="georeference, extract and write the GeoJSON data" + (" (after converting the report)" if name == "all" else ""))
        p.add_argument("--refit", action="store_true", help="refit the georeferencing instead of reusing data/georef-*.json")
        p.add_argument("--strict", action="store_true", help="fail when an id from manifest.launched.json disappears")
        p.add_argument("--allow-zone-problems", action="store_true", help="write the zones even when validation reports problems (check the overlay first)")
        p.add_argument("--max-way-distance", type=float, default=40.0, help="metres from a street centreline within which a strip belongs to it (squares and dual carriageways need ~40)")
        p.set_defaults(func=func)
    args = parser.parse_args(argv)
    args.func(args)
