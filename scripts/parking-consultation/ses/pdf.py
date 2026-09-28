"""Vector extraction from the AutoCAD PDF plots: filled shapes by colour, and the street labels."""
from __future__ import annotations

from collections import Counter

import pymupdf

from .text import normalize


def colour_key(colour) -> str:
    return ",".join(f"{v:.2f}" for v in colour)


def open_page(path: str) -> pymupdf.Page:
    return pymupdf.open(path)[0]


Point2 = tuple[float, float]


def _same(a: Point2, b: Point2) -> bool:
    return abs(a[0] - b[0]) <= 1e-6 and abs(a[1] - b[1]) <= 1e-6


def path_rings(items: list[tuple]) -> list[list[Point2]]:
    """The closed outlines of one filled path, one ring per sub-path.

    AutoCAD plots a filled rectangle as triangles, often several in one path. Chaining every
    point of such a path into a single ring gives a ring that crosses itself; repairing it with
    `buffer(0)` then keeps one triangle, and a parking strip shows as a wedge. A sub-path ends
    where the next item does not start at the current end point, or where the outline returns
    to its first point.
    """
    rings: list[list[Point2]] = []
    ring: list[Point2] = []

    def close() -> None:
        if len(ring) >= 2 and _same(ring[0], ring[-1]):
            ring.pop()
        if len(ring) >= 3:
            rings.append(ring.copy())
        ring.clear()

    for item in items:
        if item[0] == "re":
            close()
            r = item[1]
            rings.append([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)])
            continue
        if item[0] == "qu":
            close()
            q = item[1]
            rings.append([(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y)])
            continue
        if item[0] == "l":
            start, end = item[1], item[2]
        elif item[0] == "c":
            start, end = item[1], item[4]
        else:
            continue
        start_xy, end_xy = (start.x, start.y), (end.x, end.y)
        if ring and not _same(ring[-1], start_xy):
            close()
        if not ring:
            ring.append(start_xy)
        if not _same(ring[-1], end_xy):
            ring.append(end_xy)
        if len(ring) >= 4 and _same(ring[0], ring[-1]):
            close()
    close()
    return rings


def extract_filled_shapes(page: pymupdf.Page, sheet: dict) -> tuple[dict[str, list[list[list[Point2]]]], Counter]:
    """Filled paths inside the map area, grouped by the category their fill colour maps to.

    Returns each path as its rings (page coordinates, y down) and a count of filled paths whose
    colour maps to nothing, so a re-plotted sheet with new colours fails loudly instead of silently
    losing a layer.
    """
    map_x_max = sheet["mapXMax"]
    fills = sheet["fills"]
    ignore = set(sheet.get("ignoreFills", []))
    shapes: dict[str, list[list[list[Point2]]]] = {category: [] for category in fills.values()}
    unknown: Counter = Counter()
    for drawing in page.get_drawings():
        if drawing["rect"].x0 >= map_x_max or not drawing.get("fill"):
            continue
        key = colour_key(drawing["fill"])
        category = fills.get(key)
        if category is None:
            if key not in ignore:
                unknown[key] += 1
            continue
        rings = path_rings(drawing["items"])
        if rings:
            shapes[category].append(rings)
    return shapes, unknown


def extract_labels(page: pymupdf.Page, sheet: dict) -> list[tuple[float, float, str]]:
    """Street label fragments inside the map area: (x, y, normalized text), y down."""
    labels = []
    for x0, y0, x1, y1, word, *_ in page.get_text("words"):
        if x1 > sheet["mapXMax"]:
            continue
        text = normalize(word).strip(". ")
        if len(text) >= 4 and text.isalpha():
            labels.append(((x0 + x1) / 2, (y0 + y1) / 2, text))
    return labels


def legend_text(page: pymupdf.Page, sheet: dict) -> str:
    clip = pymupdf.Rect(sheet["mapXMax"], 0, page.rect.width, page.rect.height / 2)
    return page.get_text("text", clip=clip)
