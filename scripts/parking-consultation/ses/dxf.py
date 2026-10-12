"""The drawings as DWG, read through DXF (`dwg2dxf` from LibreDWG writes the DXF).

The DXF is in ΕΓΣΑ87 metres, so a coordinate is a coordinate and nothing is georeferenced.
Categories are layers. A parking strip is an open polyline with a constant width drawn along the
kerb, which the plot shows as a filled band; a spot bay and a zone are solid hatches. The number
of spots a strip holds is a text next to it, and house numbers are texts of their own.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from statistics import median

import ezdxf
from ezdxf import path as ezpath
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

from .text import normalize

MIN_SHAPE_AREA_M2 = 0.05
BOUNDARY_PATH_EXTERNAL = 1


@dataclass
class Sheet:
    doc: object
    frame: tuple[float, float, float, float]
    flatten_m: float = 0.2
    # What the reader skipped, by reason, for the sanity output.
    stats: Counter = field(default_factory=Counter)

    def in_frame(self, x: float, y: float) -> bool:
        minx, miny, maxx, maxy = self.frame
        return minx <= x <= maxx and miny <= y <= maxy

    def entities(self, layers=None):
        for entity in self.doc.modelspace():
            if layers is None or entity.dxf.layer in layers:
                yield entity


def open_sheet(path: Path, frame, flatten_m: float = 0.2) -> Sheet:
    return Sheet(ezdxf.readfile(str(path)), tuple(frame), flatten_m)


def _parts(geometry) -> list[Polygon]:
    parts = geometry.geoms if geometry.geom_type in ("MultiPolygon", "GeometryCollection") else [geometry]
    return [p for p in parts if p.geom_type == "Polygon" and p.area >= MIN_SHAPE_AREA_M2]


def _path_polygon(path, flatten_m: float) -> Polygon | None:
    points = [(v.x, v.y) for v in path.flattening(flatten_m)]
    if len(points) < 3:
        return None
    polygon = Polygon(points).buffer(0)
    return polygon if not polygon.is_empty else None


def hatch_polygons(sheet: Sheet, hatch) -> list[Polygon]:
    """A hatch's filled area. An island (a boundary path inside the external one) is a hole."""
    external, inner = [], []
    for boundary in hatch.paths:
        polygon = _path_polygon(ezpath.from_hatch_boundary_path(boundary), sheet.flatten_m)
        if polygon is None:
            sheet.stats["hatch paths without area"] += 1
        elif boundary.path_type_flags & BOUNDARY_PATH_EXTERNAL:
            external.append(polygon)
        else:
            inner.append(polygon)
    if external and inner:
        return _parts(unary_union(external).difference(unary_union(inner)))
    return _parts(unary_union(external + inner)) if external or inner else []


def polyline_polygons(sheet: Sheet, polyline) -> list[Polygon]:
    """A polyline with a width is a band; a closed one without is an outline. An open one without is a line, not a shape."""
    points = [(v.x, v.y) for v in ezpath.make_path(polyline).flattening(sheet.flatten_m)]
    if len(points) < 2:
        return []
    width = polyline.dxf.const_width if polyline.dxf.hasattr("const_width") else 0.0
    if not width:
        vertex_widths = [w for _, _, start, end, _ in polyline.get_points(format="xyseb") for w in (start, end) if w]
        width = median(vertex_widths) if vertex_widths else 0.0
    if width > 0:
        line = LineString(points + ([points[0]] if polyline.closed and points[0] != points[-1] else []))
        return _parts(line.buffer(width / 2, cap_style="flat", join_style="round"))
    if polyline.closed and len(points) >= 3:
        return _parts(Polygon(points).buffer(0))
    sheet.stats["open polylines without width"] += 1
    return []


def entity_polygons(sheet: Sheet, entity) -> list[Polygon]:
    kind = entity.dxftype()
    if kind == "HATCH":
        polygons = hatch_polygons(sheet, entity)
    elif kind in ("LWPOLYLINE", "POLYLINE"):
        polygons = polyline_polygons(sheet, entity)
    else:
        sheet.stats[f"{kind} ignored"] += 1
        return []
    kept = []
    for polygon in polygons:
        point = polygon.representative_point()
        if sheet.in_frame(point.x, point.y):
            kept.append(polygon)
        else:
            sheet.stats["shapes outside the frame"] += 1
    return kept


def layer_shapes(sheet: Sheet, layer_map: dict[str, str]) -> dict[str, list[Polygon]]:
    """Filled shapes per category, from the layers that `layer_map` names."""
    shapes: dict[str, list[Polygon]] = {category: [] for category in dict.fromkeys(layer_map.values())}
    for entity in sheet.entities(set(layer_map)):
        shapes[layer_map[entity.dxf.layer]].extend(entity_polygons(sheet, entity))
    return shapes


def boundary_polygon(sheet: Sheet, layer: str) -> Polygon | None:
    """The largest closed outline on the layer: the study area. The line's own width, if any, is
    drawing style, so the polygon follows the line and not the band it plots as."""
    polygons = []
    for entity in sheet.entities({layer}):
        if entity.dxftype() not in ("LWPOLYLINE", "POLYLINE") or not entity.closed:
            continue
        points = [(v.x, v.y) for v in ezpath.make_path(entity).flattening(sheet.flatten_m)]
        if len(points) < 3:
            continue
        if not sheet.in_frame(*points[0]):
            sheet.stats["shapes outside the frame"] += 1
            continue
        polygons.extend(_parts(Polygon(points).buffer(0)))
    return max(polygons, key=lambda p: p.area) if polygons else None


def texts(sheet: Sheet, layers=None) -> list[tuple[str, Point]]:
    """TEXT and MTEXT inside the frame, as (text, insertion point)."""
    found = []
    for entity in sheet.entities(layers):
        kind = entity.dxftype()
        if kind not in ("TEXT", "MTEXT"):
            continue
        x, y = entity.dxf.insert.x, entity.dxf.insert.y
        if not sheet.in_frame(x, y):
            sheet.stats["texts outside the frame"] += 1
            continue
        text = (entity.plain_text() if kind == "MTEXT" else entity.dxf.text).strip()
        if text:
            found.append((text, Point(x, y)))
    return found


def count_texts(sheet: Sheet, layers) -> list[tuple[int, Point]]:
    """The spot counts written next to the strips."""
    counts = []
    for text, point in texts(sheet, set(layers)):
        if text.isdigit():
            counts.append((int(text), point))
        else:
            sheet.stats["count texts that are not a number"] += 1
    return counts


def labelled_points(sheet: Sheet, labels: dict[str, str]) -> list[tuple[str, Point]]:
    """Texts that spell one of `labels` (spaces and accents aside), as (label, point)."""
    wanted = {normalize(text).replace(" ", ""): label for text, label in labels.items()}
    return [(wanted[key], point) for text, point in texts(sheet) if (key := normalize(text).replace(" ", "")) in wanted]


def split_by_lines(polygons: list[Polygon], lines, gap_m: float = 0.3) -> list[Polygon]:
    """Cut shapes along lines: a zone drawn kerb to kerb becomes one piece per street side, so each
    piece's centroid lies in the block it belongs to."""
    if not polygons:
        return []
    cutter = unary_union(list(lines)).buffer(gap_m)
    return _parts(unary_union(polygons).difference(cutter))
