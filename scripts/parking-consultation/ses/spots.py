"""Point spots (ΑΜΕΑ, charging, special): the symbol parts of one location clustered into a point."""
from __future__ import annotations

from dataclasses import dataclass

import re

from shapely.geometry import MultiPolygon, Point, Polygon
from shapely.ops import unary_union

from .osm import StreetIndex
from .text import normalize

CATEGORY_PREFIX = {"amea_shared": "amea", "amea_dedicated": "amea-ix", "ev": "ev", "special": "special"}
BAY_AREA_M2 = (6.0, 20.0)  # a drawn 5.5 × 2.25 m bay is 12.4 m²


@dataclass
class Spot:
    category: str
    point: Point
    n_spots: int
    parts: int
    street: str | None = None
    cross: str | None = None
    address: str | None = None  # the report's own wording for this location, when a table row matched
    id: str = ""


def cluster_spots(category: str, polygons: list[Polygon], cluster_radius: float = 2.0) -> list[Spot]:
    if not polygons:
        return []
    merged = unary_union([p.buffer(cluster_radius) for p in polygons])
    clusters = list(merged.geoms) if isinstance(merged, MultiPolygon) else [merged]
    spots = []
    for cluster in clusters:
        members = [p for p in polygons if cluster.contains(p.representative_point())]
        if not members:
            continue
        bays = sum(1 for p in members if BAY_AREA_M2[0] <= p.area <= BAY_AREA_M2[1])
        spots.append(Spot(category, unary_union(members).centroid, max(1, bays), len(members)))
    return spots


def name_spots(spots: list[Spot], streets: StreetIndex, max_distance: float = 25.0) -> None:
    for spot in spots:
        spot.street, spot.cross = streets.nearest_street_and_cross(spot.point, max_distance)


ADDRESS_RE = re.compile(r"^\s*(?:ΠΑΡ\.|ΠΑΡΑΔΡΟΜΟΣ|ΠΛΑΤΕΙΑ|ΠΛ\.)?\s*([Α-ΩΆ-ΏΪΫ][Α-ΩΆ-ΏΪΫ\s\.]*?)\s*(?:\d[\d\-]*)?\s*(?:\((.*?)\))?\s*(?:[–-].*)?$")
HINT_RE = re.compile(r"(?:διαστ\.?\s*με|πλησίον|μεταξύ)\s+(.+)")


def _hint_names(hint: str | None) -> list[str]:
    if not hint:
        return []
    match = HINT_RE.search(hint)
    if not match:
        return []
    return [part.strip() for part in re.split(r"\s+και\s+", match.group(1)) if part.strip()]


def apply_table_counts(spots: list[Spot], rows: list[list[str]], streets: StreetIndex) -> list[str]:
    """Take spot counts and the report's wording from a table of (address, count) rows.

    A row names a street, optionally a house number, and a hint in parentheses ("διαστ. με Τσιγάντε",
    "μεταξύ Βεντούρη και Φανερωμένης"). It matches the still unmatched spot on that street whose
    nearest cross-street is named in the hint, or the only spot on the street. Returns the rows
    that matched nothing, for the operator to check.
    """
    unmatched = []
    for row in rows:
        if len(row) < 2 or not row[0].strip() or normalize(row[0]).startswith("ΣΥΝΟΛΟ"):
            continue
        address, count = row[0].strip(), row[1].strip()
        match = ADDRESS_RE.match(address)
        if not match or not count.isdigit():
            unmatched.append(address)
            continue
        street = normalize(streets.canonical(match.group(1).strip()))
        hints = [normalize(streets.canonical(h)) for h in _hint_names(match.group(2))]
        known_hints = [h for h in hints if streets.find(h)]
        candidates = [s for s in spots if s.address is None and s.street and normalize(s.street) == street]
        chosen = None
        if hints:
            chosen = next((s for s in candidates if s.cross and normalize(s.cross) in hints), None)
        # A hint that names a real cross-street with no spot there is a mismatch. A hint that names
        # a landmark ("Νοσ. Γ. Γεννηματάς") says nothing about the cross-street, so the only spot
        # left on that street is taken.
        if chosen is None and not known_hints and len(candidates) == 1:
            chosen = candidates[0]
        if chosen is None:
            unmatched.append(address)
            continue
        chosen.n_spots = int(count)
        chosen.address = address
    return unmatched
