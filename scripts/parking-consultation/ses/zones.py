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
SLIVER_M2 = 500.0  # a zone part smaller than this is a cut-off corner, not a block
SHARED_MIN_OVERLAP = 0.4  # a unit that overlaps two zones' strips this much lies on a shared stretch


def build_zone_polygons(
    streets: StreetIndex,
    zone_strips: dict[str, list[Polygon]],
    weight: str = "count",
    min_weight: float = BLOCK_MIN_STRIPS,
    boundary: Polygon | None = None,
) -> tuple[dict[str, Polygon], dict]:
    """Zone areas as unions of the street-network blocks that hold each zone's strips.

    A block goes to the zone with the most strips in it (`weight="count"`), or with the largest
    strip area (`weight="area"`, for a drawing whose zones are street corridors cut per block side).
    `boundary` clips the result to the study area, so a corridor along a boundary street does not
    pull in the block across it.
    """
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
                counts[hits[0]][letter] += strip.area if weight == "area" else 1
            else:
                unplaced[letter] += 1

    strip_reach = {letter: unary_union(strips).buffer(EDGE_BLOCK_REACH_M) for letter, strips in zone_strips.items() if strips}
    assigned: dict[str, list[Polygon]] = defaultdict(list)
    contested = 0
    clipped = 0
    for index, letters in counts.items():
        (winner, top), *rest = letters.most_common()
        if top < min_weight:
            continue
        if rest and rest[0][1] == top:
            contested += 1
        block = blocks[index]
        if block.area > BLOCK_MAX_AREA_M2:
            # An edge face (hospital grounds, the far side of the avenue) is not a block: keep the
            # part inside the study area, or without a boundary the part near the strips that placed it here.
            block = block.intersection(boundary) if boundary is not None else block.intersection(strip_reach[winner])
            clipped += 1
        assigned[winner].append(block)
    filled = 0
    if boundary is not None and assigned:
        # The zones partition the whole area: a block inside it whose streets hold no strips (a
        # square, the hospital grounds, a block with paid parking only) belongs to the zone next to it.
        placed = {index for index, letters in counts.items() if letters.most_common(1)[0][1] >= min_weight}
        unions = {letter: unary_union(faces) for letter, faces in assigned.items()}
        for index, block in enumerate(blocks):
            if index in placed:
                continue
            inside = block.intersection(boundary)
            if inside.area < SLIVER_M2:
                continue
            nearest = min(unions, key=lambda letter: unions[letter].distance(inside.centroid))
            assigned[nearest].append(inside)
            filled += 1
    zones = {}
    for letter, faces in assigned.items():
        polygon = unary_union(faces).buffer(0.05).buffer(-0.05)
        if boundary is not None:
            polygon = polygon.intersection(boundary)
        parts = [part for part in getattr(polygon, "geoms", [polygon]) if part.geom_type == "Polygon" and part.area >= SLIVER_M2]
        if parts:
            zones[letter] = unary_union(parts)
    stats = {"blocks": len(blocks), "blocks_with_strips": len(counts), "contested_blocks": contested, "clipped_edge_blocks": clipped, "filled_blocks": filled, "unplaced_strips": dict(unplaced)}
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
    """Zone from the Π1 strips the unit overlaps (a stretch shared by two zones names both), else from the polygon."""
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
            shared = sorted(letter for letter in letters if overlaps[letter] >= SHARED_MIN_OVERLAP)
            unit.zone = "-".join(GREEK_LETTER[letter] for letter in shared) if len(shared) > 1 else GREEK_LETTER[letters[0]]
            unit.zone_source = "p1-strips"
            continue
        centroid = unit.geometry.centroid
        for letter, prepared in prepared_zones.items():
            if prepared.contains(centroid):
                unit.zone = GREEK_LETTER[letter]
                unit.zone_source = "polygon"
                break
