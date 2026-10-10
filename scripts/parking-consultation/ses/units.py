"""Block-side units: the strips of one category on one side of a street between two cross-streets."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from shapely.geometry import Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree

from .osm import StreetIndex

CATEGORY_PREFIX = {"residents": "res", "paid": "paid", "motorcycles": "moto", "excluded": "excl"}
MIN_PART_AREA_M2 = 0.5
WHOLE_SHAPE_FILL = 0.9  # a drawn strip fills its rotated bounding rectangle; a triangle or a wedge does not


def join_plot_fragments(polygons: list[Polygon], min_shared_edge_m: float = 0.05) -> list[Polygon]:
    """AutoCAD plots one filled strip as several paths (triangles and wedges) that share edges.

    Placed one by one, the fragments of a strip can land on different street sides, and each unit
    then shows a wedge. This joins fragments that share an edge into the strip they draw. A shape
    that fills its rotated bounding rectangle is a whole strip already and is never joined, so two
    strips that touch across a junction stay on their own block sides.
    """
    if not polygons:
        return []
    tree = STRtree(polygons)
    parent = list(range(len(polygons)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    fragment = [polygon.area < WHOLE_SHAPE_FILL * polygon.minimum_rotated_rectangle.area for polygon in polygons]
    for i, polygon in enumerate(polygons):
        if not fragment[i]:
            continue
        for j in tree.query(polygon):
            j = int(j)
            if j != i and fragment[j] and polygon.intersection(polygons[j]).length > min_shared_edge_m:
                parent[find(i)] = find(j)
    groups: dict[int, list[Polygon]] = defaultdict(list)
    for i, polygon in enumerate(polygons):
        groups[find(i)].append(polygon)
    joined: list[Polygon] = []
    for members in groups.values():
        shape = unary_union(members) if len(members) > 1 else members[0]
        joined.extend(shape.geoms if shape.geom_type == "MultiPolygon" else [shape])
    return joined


def _without_slivers(geometry):
    """Simplifying can shrink a small part to nothing; such a part would reach the map as a point."""
    parts = list(geometry.geoms) if geometry.geom_type == "MultiPolygon" else [geometry]
    kept = [part for part in parts if part.area >= MIN_PART_AREA_M2]
    return unary_union(kept) if kept else geometry


@dataclass
class Unit:
    category: str
    way: int
    street: str
    start: float
    end: float
    from_cross: str | None
    to_cross: str | None
    side: str  # 'l' or 'r', relative to travel from `from_cross` to `to_cross`
    strips: list[Polygon] = field(default_factory=list)
    length_m: float = 0.0
    geometry: object = None
    id: str = ""
    zone: str | None = None
    zone_source: str | None = None
    calm_traffic: bool = False
    excluded_reason: str | None = None

    @property
    def mid_station(self) -> float:
        return (self.start + self.end) / 2


def canonical_forward(dx: float, dy: float) -> bool:
    """Whether increasing station along the way is the canonical direction.

    Canonical = eastward; northward when the way runs within a few degrees of north-south. The
    choice is arbitrary but independent of how OpenStreetMap happened to draw the way, so ids
    survive a redrawn way.
    """
    if abs(dx) > 0.05:
        return dx > 0
    return dy > 0


def _extent_along(line, polygon: Polygon) -> float:
    stations = [line.project(type(polygon.centroid)(x, y)) for x, y in polygon.exterior.coords]
    return max(stations) - min(stations)


def build_units(
    shapes_by_category: dict[str, list[Polygon]],
    streets: StreetIndex,
    max_way_distance: float = 12.0,
    merge_gap: float = 0.6,
    simplify_m: float = 0.25,
) -> tuple[list[Unit], list[tuple[str, Polygon]]]:
    """Group strips into units. Strips farther than `max_way_distance` from any street are orphans."""
    units: dict[tuple, Unit] = {}
    orphans: list[tuple[str, Polygon]] = []
    for category, polygons in shapes_by_category.items():
        for polygon in polygons:
            centroid = polygon.centroid
            way = streets.nearest_way(centroid, max_way_distance)
            if way is None:
                orphans.append((category, polygon))
                continue
            line = streets.lines[way]
            station = line.project(centroid)
            block = streets.block_at(way, station)

            # Side of the way, seen along increasing station.
            dx, dy = streets.tangent(way, station)
            on_line = line.interpolate(station)
            left_of_way = dx * (centroid.y - on_line.y) - dy * (centroid.x - on_line.x) > 0

            # The block's chord decides the canonical direction, so every strip of the block agrees.
            a, b = line.interpolate(block.start), line.interpolate(block.end)
            chord = (b.x - a.x, b.y - a.y)
            forward = canonical_forward(*chord) if (abs(chord[0]) + abs(chord[1])) > 1e-6 else canonical_forward(dx, dy)
            if forward:
                from_cross, to_cross, side = block.start_cross, block.end_cross, ("l" if left_of_way else "r")
            else:
                from_cross, to_cross, side = block.end_cross, block.start_cross, ("r" if left_of_way else "l")

            key = (category, way, round(block.start, 1), round(block.end, 1), side)
            unit = units.get(key)
            if unit is None:
                unit = Unit(category, way, streets.names[way], block.start, block.end, from_cross, to_cross, side)
                units[key] = unit
            unit.strips.append(polygon)
            unit.length_m += _extent_along(line, polygon)

    for unit in units.values():
        merged = unary_union([strip.buffer(merge_gap) for strip in unit.strips]).buffer(-merge_gap)
        if merged.is_empty:
            merged = unary_union(unit.strips)
        unit.geometry = _without_slivers(merged.simplify(simplify_m, preserve_topology=True))
        unit.length_m = round(unit.length_m, 1)

    ordered = sorted(units.values(), key=lambda u: (u.category, u.street, u.mid_station, u.side))
    return ordered, orphans


def estimated_spots(unit: Unit, spot_area_m2: dict[str, float]) -> int:
    """Spots a unit holds, from the drawn strip area: a kerb bay is 5.5 × 2.25 m, but angled bays
    and squares are wider than long, which a length-based rule undercounts or overcounts."""
    area = spot_area_m2.get(unit.category)
    if not area:
        return 0
    return max(1, round(unit.geometry.area / area))
