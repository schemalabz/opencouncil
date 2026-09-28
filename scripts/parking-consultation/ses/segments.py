"""Street segments named in the report's tables ("Ασπασίας (από Κύπρου έως Αναστάσεως)")."""
from __future__ import annotations

import re
from dataclasses import dataclass

from .osm import StreetIndex
from .units import Unit

SEGMENT_RE = re.compile(r"^\s*(.+?)\s*\(\s*από\s+(.+?)\s+έως\s+(.+?)\s*\)\s*$")
WHOLE_STREET_RE = re.compile(r"^\s*([^(]+?)\s*(?:\(.*\))?\s*$")


@dataclass
class Segment:
    street: str
    from_cross: str | None
    to_cross: str | None
    note: str | None


def parse_segment(cell: str, note: str | None = None) -> Segment | None:
    match = SEGMENT_RE.match(cell)
    if match:
        return Segment(match.group(1), match.group(2), match.group(3), note)
    match = WHOLE_STREET_RE.match(cell)
    if match and match.group(1):
        return Segment(match.group(1), None, None, note)
    return None


def segments_from_table(table: dict) -> list[Segment]:
    """Rows whose first cell names a street; the second cell, when present, is the note (reason)."""
    segments = []
    for row in table.get("rows", []):
        if not row or not row[0].strip():
            continue
        if row[0].strip().isdigit() and len(row) > 1:  # numbered rows: "1 | Ασπασίας (από ...)"
            cell, note = row[1], (row[2] if len(row) > 2 else None)
        else:
            cell, note = row[0], (row[1] if len(row) > 1 else None)
        segment = parse_segment(cell, note)
        if segment:
            segments.append(segment)
    return segments


def units_on_segment(segment: Segment, units: list[Unit], streets: StreetIndex) -> tuple[list[Unit], str | None]:
    """Units whose block lies on the segment. Returns the units and a reason when nothing matched."""
    ways = streets.find(segment.street)
    if not ways:
        return [], f"street '{segment.street}' not in OSM"
    matched: list[Unit] = []
    crossings_found = False
    for way in ways:
        if segment.from_cross is None:
            matched.extend(u for u in units if u.way == way)
            crossings_found = True
            continue
        a = streets.station_of_crossing(way, segment.from_cross)
        b = streets.station_of_crossing(way, segment.to_cross)
        if a is None or b is None:
            continue
        crossings_found = True
        low, high = min(a, b) - 1.0, max(a, b) + 1.0
        matched.extend(u for u in units if u.way == way and low <= u.mid_station <= high)
    if not crossings_found:
        return [], f"'{segment.street}': crossings '{segment.from_cross}'/'{segment.to_cross}' not found"
    return matched, None
