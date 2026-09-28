"""Stable ids. A comment references an id, so ids must survive a re-run on changed drawings."""
from __future__ import annotations

from collections import defaultdict

from .spots import CATEGORY_PREFIX as SPOT_PREFIX
from .spots import Spot
from .text import slug
from .units import CATEGORY_PREFIX as UNIT_PREFIX
from .units import Unit


def _cross(name: str | None) -> str:
    return slug(name) if name else "end"


def assign_unit_ids(units: list[Unit], aliases: dict[str, str]) -> None:
    by_id: dict[str, list[Unit]] = defaultdict(list)
    for unit in units:
        base = f"{UNIT_PREFIX[unit.category]}-{slug(unit.street)}-{_cross(unit.from_cross)}-{_cross(unit.to_cross)}-{unit.side}"
        by_id[base].append(unit)
    for base, group in by_id.items():
        group.sort(key=lambda u: u.mid_station)
        for index, unit in enumerate(group):
            candidate = base if index == 0 else f"{base}-{index + 1}"
            unit.id = aliases.get(candidate, candidate)


def assign_spot_ids(spots: list[Spot], aliases: dict[str, str]) -> None:
    by_id: dict[str, list[Spot]] = defaultdict(list)
    for spot in spots:
        base = f"{SPOT_PREFIX[spot.category]}-{slug(spot.street) if spot.street else 'unknown'}-{_cross(spot.cross)}"
        by_id[base].append(spot)
    for base, group in by_id.items():
        group.sort(key=lambda s: (s.point.x, s.point.y))
        for index, spot in enumerate(group):
            candidate = base if index == 0 else f"{base}-{index + 1}"
            spot.id = aliases.get(candidate, candidate)


def check_unique(ids: list[str]) -> list[str]:
    seen: set[str] = set()
    duplicates = []
    for value in ids:
        if value in seen:
            duplicates.append(value)
        seen.add(value)
    return duplicates
