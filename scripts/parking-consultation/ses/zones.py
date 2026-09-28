"""Resident zones as areas, derived from the drawing itself.

Π1 draws each zone as coloured strips along the streets, never as an area. The street network
divides the town into blocks (faces between centrelines). A strip lies inside the block on its
side of the street, so each block is assigned the zone whose strips it holds the most of, and a
zone's area is the union of its blocks. The outer edge of that union runs along street
centrelines, which is what a reader expects on the map.
"""
from __future__ import annotations

from collections import Counter, defaultdict

from shapely import set_precision
from shapely.geometry import Polygon
from shapely.ops import polygonize, unary_union
from shapely.prepared import prep
from shapely.strtree import STRtree

from .osm import StreetIndex
from .units import Unit

GREEK_LETTER = {"A": "Α", "B": "Β", "C": "Γ", "D": "Δ"}
BLOCK_MIN_STRIPS = 2
BLOCK_MAX_AREA_M2 = 60_000  # a city block; a face at the edge of the street network can be square kilometres
EDGE_BLOCK_REACH_M = 50.0  # how far past its strips an oversized edge block still counts as zone area


def build_zone_polygons(streets: StreetIndex, zone_strips: dict[str, list[Polygon]]) -> tuple[dict[str, Polygon], dict]:
    """Zone areas as unions of the street-network blocks that hold each zone's strips."""
    # Snap to a 1 cm grid first: a street end that misses its cross-street by a hair leaves the block open.
    blocks = list(polygonize(unary_union(set_precision(unary_union(streets.lines), 0.01))))
    tree = STRtree(blocks)
    counts: dict[int, Counter] = defaultdict(Counter)
    unplaced = Counter()
    for letter, strips in zone_strips.items():
        for strip in strips:
            centroid = strip.centroid
            hits = [int(i) for i in tree.query(centroid) if blocks[int(i)].contains(centroid)]
            if hits:
                counts[hits[0]][letter] += 1
            else:
                unplaced[letter] += 1

    strip_reach = {letter: unary_union(strips).buffer(EDGE_BLOCK_REACH_M) for letter, strips in zone_strips.items() if strips}
    assigned: dict[str, list[Polygon]] = defaultdict(list)
    contested = 0
    clipped = 0
    for index, letters in counts.items():
        (winner, top), *rest = letters.most_common()
        if top < BLOCK_MIN_STRIPS:
            continue
        if rest and rest[0][1] == top:
            contested += 1
        block = blocks[index]
        if block.area > BLOCK_MAX_AREA_M2:
            # An edge face (hospital grounds, the far side of the avenue) is not a block: keep only
            # the part near the strips that placed it here.
            block = block.intersection(strip_reach[winner])
            clipped += 1
        assigned[winner].append(block)
    zones = {letter: unary_union(faces).buffer(0.05).buffer(-0.05) for letter, faces in assigned.items()}
    stats = {"blocks": len(blocks), "blocks_with_strips": len(counts), "contested_blocks": contested, "clipped_edge_blocks": clipped, "unplaced_strips": dict(unplaced)}
    return zones, stats


def validate_zones(zones: dict[str, Polygon], zone_strips: dict[str, list[Polygon]], tolerance_m: float = 3.0, min_share: float = 0.97) -> tuple[dict, list[str]]:
    stats: dict = {}
    problems: list[str] = []
    letters = list(zones)
    for i, a in enumerate(letters):
        for b in letters[i + 1:]:
            overlap = zones[a].intersection(zones[b]).area / min(zones[a].area, zones[b].area)
            if overlap > 0.005:
                problems.append(f"zones {a} and {b} overlap by {overlap:.1%}")
    # On the shared Α-Δ stretch the two colours alternate along the same kerb, so a strip there
    # belongs to whichever zone won its block; it counts as inside when it touches the other zone's strips.
    strip_unions = {letter: unary_union(strips) for letter, strips in zone_strips.items() if strips}
    for letter, polygon in zones.items():
        prepared = prep(polygon.buffer(tolerance_m))
        strips = zone_strips.get(letter, [])
        others = unary_union([geom for other, geom in strip_unions.items() if other != letter]).buffer(1.0) if len(strip_unions) > 1 else Polygon()
        shared = prep(others)
        inside = sum(1 for s in strips if prepared.contains(s.centroid) or shared.intersects(s))
        share = inside / len(strips) if strips else 0.0
        parts = len(getattr(polygon, "geoms", [polygon]))
        stats[letter] = {"area_ha": round(polygon.area / 10000, 2), "parts": parts, "strips": len(strips), "inside": inside, "share": round(share, 3)}
        if strips and share < min_share:
            problems.append(f"zone {letter}: only {share:.1%} of its strips fall inside its polygon")
        if parts > 1:
            problems.append(f"zone {letter}: polygon has {parts} disjoint parts")
    return stats, problems


def assign_zones(units: list[Unit], zone_strips: dict[str, list[Polygon]], zones: dict[str, Polygon], min_overlap: float = 0.2) -> None:
    """Zone from the Π1 strips the unit overlaps (handles the shared Α-Δ stretch), else from the polygon."""
    strip_geoms = {letter: unary_union(strips).buffer(1.0) for letter, strips in zone_strips.items() if strips}
    strip_prepared = {letter: prep(geom) for letter, geom in strip_geoms.items()}
    prepared_zones = {letter: prep(polygon) for letter, polygon in zones.items()}
    for unit in units:
        area = unit.geometry.area or 1.0
        overlaps = {}
        for letter, prepared in strip_prepared.items():
            if prepared.intersects(unit.geometry):
                fraction = unit.geometry.intersection(strip_geoms[letter]).area / area
                if fraction >= min_overlap:
                    overlaps[letter] = fraction
        if overlaps:
            letters = sorted(overlaps, key=overlaps.get, reverse=True)
            unit.zone = "Α-Δ" if set(letters) == {"A", "D"} else GREEK_LETTER[letters[0]]
            unit.zone_source = "p1-strips"
            continue
        centroid = unit.geometry.centroid
        for letter, prepared in prepared_zones.items():
            if prepared.contains(centroid):
                unit.zone = GREEK_LETTER[letter]
                unit.zone_source = "polygon"
                break
