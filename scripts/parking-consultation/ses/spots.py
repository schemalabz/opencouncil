"""Point spots (ΑΜΕΑ, charging, special): the symbol parts of one location clustered into a point."""
from __future__ import annotations

from dataclasses import dataclass

import re

from shapely.geometry import MultiPolygon, Point, Polygon
from shapely.ops import unary_union

from .osm import StreetIndex
from .text import normalize

CATEGORY_PREFIX = {"amea_shared": "amea", "amea_dedicated": "amea-ix", "ev": "ev", "pharmacies": "pharmacy", "special": "special"}
BAY_AREA_M2 = (6.0, 20.0)  # a drawn 5.5 × 2.25 m bay is 12.4 m²
HOUSE_NUMBER_STREET_M = 30.0  # a house number belongs to the street it is drawn next to
HOUSE_NUMBER_SPOT_M = 20.0  # a spot "at" an address is drawn within this of the number
CROSSING_MAX_DISTANCE_M = 40.0  # a spot "at the junction with" a street is within this of the crossing


@dataclass
class Spot:
    category: str
    point: Point
    n_spots: int
    parts: int
    street: str | None = None
    cross: str | None = None
    address: str | None = None  # the report's own wording for this location, when a table row matched
    note: str | None = None  # what the spot is for, when a table row says so
    label: str | None = None  # what the drawing writes on it ("TAXI")
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


ADDRESS_RE = re.compile(
    r"^\s*(?:ΠΑΡ\.|ΠΑΡΑΔΡΟΜΟΣ|ΠΛΑΤΕΙΑ|ΠΛ\.)?\s*((?:\d{1,2}[α-ωά-ώ]{1,3}\s+)?[Α-ΩΆ-ΏΪΫ][Α-ΩΆ-ΏΪΫ\s\.]*?)\s*(\d[\d\-]*)?"
    r"(?:\s+(?:ΚΑΙ|&)\s+([Α-ΩΆ-ΏΪΫ][Α-ΩΆ-ΏΪΫ\s\.]*?)(?:\s*\d[\d\-]*)?)?\s*(?:\((.*?)\))?\s*(?:[–-].*)?$"
)
HINT_RE = re.compile(r"(?:διαστ\.?\s*με|πλησίον|μεταξύ)\s+(.+)")


def _hint_names(hint: str | None) -> list[str]:
    if not hint:
        return []
    match = HINT_RE.search(hint)
    if not match:
        return []
    return [part.strip() for part in re.split(r"\s+και\s+", match.group(1)) if part.strip()]


def _number_tokens(text: str) -> set[str]:
    return {token for token in re.split(r"[\s\-–]+", text.strip()) if token}


def geocode(street: str, number: str, house_numbers: list[tuple[str, Point]], streets: StreetIndex) -> Point | None:
    """Where a house number is drawn next to the named street. "6-8" matches "6", "8" or "6-8"."""
    ways = [streets.lines[w] for w in streets.find(street)]
    if not ways:
        return None
    wanted = _number_tokens(number)
    nearest = None
    for text, point in house_numbers:
        if not (_number_tokens(text) & wanted):
            continue
        distance = min(way.distance(point) for way in ways)
        if distance <= HOUSE_NUMBER_STREET_M and (nearest is None or distance < nearest[0]):
            nearest = (distance, point)
    return nearest[1] if nearest else None


def label_spots(spots: list[Spot], labels: list[tuple[str, Point]], max_distance: float = 2.0) -> None:
    """What the drawing writes on a spot ("TAXI")."""
    for label, point in labels:
        near = [s for s in spots if s.point.distance(point) <= max_distance]
        if near:
            min(near, key=lambda s: s.point.distance(point)).label = label


@dataclass
class _Row:
    address: str
    count: int
    note: str | None
    street: str  # normalised canonical name
    street_raw: str
    number: str | None
    hints: list[str]  # normalised canonical names from "ΚΑΙ <cross>" and the parenthesis
    known_hints: list[str]  # the hints that name a real street


def _parse_rows(rows: list[list[str]], streets: StreetIndex) -> tuple[list[_Row], list[str]]:
    parsed, unmatched = [], []
    for row in rows:
        if len(row) < 2 or not row[0].strip() or normalize(row[0]).startswith("ΣΥΝΟΛΟ"):
            continue
        address, count = row[0].strip(), row[1].strip()
        match = ADDRESS_RE.match(address)
        if not match or not count.isdigit():
            unmatched.append(address)
            continue
        street_raw = match.group(1).strip()
        hints = [normalize(streets.canonical(h)) for h in _hint_names(match.group(4))]
        if match.group(3):
            hints.append(normalize(streets.canonical(match.group(3).strip())))
        note = row[2].strip() if len(row) > 2 and row[2].strip() else None
        parsed.append(_Row(address, int(count), note, normalize(streets.canonical(street_raw)), street_raw, match.group(2), hints, [h for h in hints if streets.find(h)]))
    return parsed, unmatched


def _take(spot: Spot, row: _Row) -> None:
    spot.n_spots = row.count
    spot.address = row.address
    if row.note:
        spot.note = row.note


def _nearest_to_crossing(candidates: list[Spot], row: _Row, streets: StreetIndex) -> Spot | None:
    """The spot on the street nearest to where a hinted cross-street meets it."""
    best = None
    max_distance = CROSSING_MAX_DISTANCE_M
    for way in streets.find(row.street_raw):
        line = streets.lines[way]
        for hint in row.known_hints:
            station = streets.station_of_crossing(way, hint)
            if station is None:
                continue
            crossing = line.interpolate(station)
            for spot in candidates:
                distance = spot.point.distance(crossing)
                if distance <= max_distance and (best is None or distance < best[0]):
                    best = (distance, spot)
    return best[1] if best else None


def apply_table_counts(spots: list[Spot], rows: list[list[str]], streets: StreetIndex, house_numbers: list[tuple[str, Point]] | None = None) -> list[str]:
    """Take spot counts and the report's wording from a table of (address, count[, note]) rows.

    A row names a street, optionally a house number, a cross-street ("ΚΑΙ ΧΙΟΥ") and a hint in
    parentheses ("διαστ. με Τσιγάντε", "μεταξύ Βεντούρη και Φανερωμένης"). With the drawing's house
    numbers, numbered rows go first and the nearest row-spot pair wins, so two rows on one street
    cannot swap spots. The other rows match the still unmatched spot on their street whose nearest
    cross-street is named, else the spot nearest to that crossing, else the only spot on the street.
    Returns the rows that matched nothing, for the operator to check.
    """
    parsed, unmatched = _parse_rows(rows, streets)
    taken: set[int] = set()
    if house_numbers:
        pairs = []
        for index, row in enumerate(parsed):
            point = geocode(row.street_raw, row.number, house_numbers, streets) if row.number else None
            if point is not None:
                pairs += [(spot.point.distance(point), index, spot) for spot in spots if spot.address is None and spot.point.distance(point) <= HOUSE_NUMBER_SPOT_M]
        for _, index, spot in sorted(pairs, key=lambda pair: pair[0]):
            if index not in taken and spot.address is None:
                _take(spot, parsed[index])
                taken.add(index)
    for index, row in enumerate(parsed):
        if index in taken:
            continue
        candidates = [s for s in spots if s.address is None and s.street and normalize(s.street) == row.street]
        chosen = None
        if row.hints:
            chosen = next((s for s in candidates if s.cross and normalize(s.cross) in row.hints), None)
        if chosen is None and row.known_hints:
            chosen = _nearest_to_crossing(candidates, row, streets)
        # A hint that names a landmark ("Νοσ. Γ. Γεννηματάς") says nothing about the cross-street,
        # so the only spot left on that street is taken.
        if chosen is None and not row.known_hints and len(candidates) == 1:
            chosen = candidates[0]
        if chosen is None:
            unmatched.append(row.address)
            continue
        _take(chosen, row)
    return unmatched
