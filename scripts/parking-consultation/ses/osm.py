"""OpenStreetMap streets: a committed snapshot, and a spatial index of named streets."""
from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import requests
from shapely.geometry import LineString, MultiLineString, Point
from shapely.ops import linemerge, unary_union
from shapely.strtree import STRtree

from .crs import from_wgs84
from .text import normalize

OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
USER_AGENT = "opencouncil-parking-consultation/1.0 (https://opencouncil.gr)"


def fetch_ways(bbox: tuple[float, float, float, float], out_path: Path) -> int:
    """Download every named highway in bbox (south, west, north, east) into a trimmed snapshot."""
    query = f'[out:json][timeout:90];way["highway"]["name"]({bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]});out geom;'
    last_error: Exception | None = None
    for url in OVERPASS_MIRRORS:
        try:
            response = requests.post(url, data={"data": query}, headers={"User-Agent": USER_AGENT}, timeout=120)
            response.raise_for_status()
            elements = response.json()["elements"]
            break
        except Exception as error:  # noqa: BLE001 - any mirror failure means try the next one
            last_error = error
    else:
        raise RuntimeError(f"every Overpass mirror failed: {last_error}")
    ways = trim_elements(elements)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(ways, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return len(ways)


def trim_elements(elements: list[dict]) -> list[dict]:
    ways = []
    for element in elements:
        coords = [[round(p["lon"], 6), round(p["lat"], 6)] for p in element.get("geometry", [])]
        if len(coords) < 2:
            continue
        ways.append({"id": element["id"], "name": element["tags"]["name"], "highway": element["tags"].get("highway"), "coords": coords})
    return ways


def load_ways(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


@dataclass
class Block:
    """The stretch of a street between two cross-streets, as stations along the merged line."""
    way: int
    start: float
    end: float
    start_cross: str | None
    end_cross: str | None


class StreetIndex:
    """Named streets as merged lines in ΕΓΣΑ87, with their intersections.

    `aliases` maps a name as written anywhere (report, drawing, OSM variant) to the canonical name.
    Same-named OSM ways are merged, so a block is bounded by real cross-streets and not by the
    arbitrary node where one OSM way ends and the next begins.
    """

    def __init__(self, ways: list[dict], aliases: dict[str, str] | None = None, extra_lines: list[tuple[str, LineString]] | None = None):
        self._aliases = {normalize(k): v for k, v in (aliases or {}).items()}
        by_name: dict[str, list[LineString]] = defaultdict(list)
        for way in ways:
            line = LineString([from_wgs84(lon, lat) for lon, lat in way["coords"]])
            by_name[self.canonical(way["name"])].append(line)
        for name, line in extra_lines or []:
            by_name[self.canonical(name)].append(line)

        self.lines: list[LineString] = []
        self.names: list[str] = []
        for name, lines in by_name.items():
            merged = linemerge(unary_union(lines)) if len(lines) > 1 else lines[0]
            parts = list(merged.geoms) if isinstance(merged, MultiLineString) else [merged]
            for part in parts:
                self.lines.append(part)
                self.names.append(name)
        self.norm_names = [normalize(n) for n in self.names]
        self.tree = STRtree(self.lines)
        self._build_intersections()

    def canonical(self, name: str) -> str:
        return self._aliases.get(normalize(name), name)

    def _build_intersections(self) -> None:
        # Per way: sorted (station, other way index) for every crossing with a differently named street.
        self.crossings: dict[int, list[tuple[float, int]]] = defaultdict(list)
        for i, line in enumerate(self.lines):
            for j in self.tree.query(line):
                j = int(j)
                if j <= i or self.norm_names[j] == self.norm_names[i]:
                    continue
                hit = line.intersection(self.lines[j])
                if hit.is_empty:
                    continue
                points = [g for g in getattr(hit, "geoms", [hit]) if g.geom_type == "Point"]
                for point in points:
                    self.crossings[i].append((line.project(point), j))
                    self.crossings[j].append((self.lines[j].project(point), i))
        for stations in self.crossings.values():
            stations.sort()

    def find(self, name: str) -> list[int]:
        target = normalize(self.canonical(name))
        return [i for i, n in enumerate(self.norm_names) if n == target]

    def nearest_way(self, geom, max_distance: float) -> int | None:
        index = int(self.tree.nearest(geom))
        return index if self.lines[index].distance(geom) <= max_distance else None

    def block_at(self, way: int, station: float) -> Block:
        before = [(s, j) for s, j in self.crossings.get(way, []) if s <= station]
        after = [(s, j) for s, j in self.crossings.get(way, []) if s >= station]
        start, start_cross = (before[-1][0], self.names[before[-1][1]]) if before else (0.0, None)
        end, end_cross = (after[0][0], self.names[after[0][1]]) if after else (self.lines[way].length, None)
        return Block(way, start, end, start_cross, end_cross)

    def station_of_crossing(self, way: int, cross_name: str) -> float | None:
        target = normalize(self.canonical(cross_name))
        stations = [s for s, j in self.crossings.get(way, []) if self.norm_names[j] == target]
        return sum(stations) / len(stations) if stations else None

    def tangent(self, way: int, station: float) -> tuple[float, float]:
        line = self.lines[way]
        a = line.interpolate(max(0.0, station - 1.0))
        b = line.interpolate(min(line.length, station + 1.0))
        dx, dy = b.x - a.x, b.y - a.y
        length = (dx * dx + dy * dy) ** 0.5 or 1.0
        return dx / length, dy / length

    def nearest_street_and_cross(self, point: Point, max_distance: float) -> tuple[str | None, str | None]:
        """The street a point lies on and the nearest cross-street along it."""
        way = self.nearest_way(point, max_distance)
        if way is None:
            return None, None
        station = self.lines[way].project(point)
        crossings = self.crossings.get(way, [])
        if not crossings:
            return self.names[way], None
        nearest = min(crossings, key=lambda sj: abs(sj[0] - station))
        return self.names[way], self.names[nearest[1]]
