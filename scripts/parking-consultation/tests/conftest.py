"""Synthetic street grid in ΕΓΣΑ87 metres for the unit and zone tests.

Main street: y = 0 from x = 0 to 300 (west → east). Cross streets at x = 100 ("Alpha") and
x = 200 ("Beta"), each from y = -100 to 100. A north-south street at x = 0..0 is deliberately
absent so the westmost block starts at the way's end.
"""
import pytest
from shapely.geometry import Polygon

from ses.osm import StreetIndex
from ses.crs import to_wgs84


def _way(way_id: int, name: str, points_egsa):
    return {"id": way_id, "name": name, "highway": "residential", "coords": [list(to_wgs84(x, y)) for x, y in points_egsa]}


@pytest.fixture
def grid_ways():
    x0, y0 = 480_000.0, 4_205_000.0
    return [
        _way(1, "Κύρια", [(x0, y0), (x0 + 150, y0)]),
        _way(2, "Κύρια", [(x0 + 150, y0), (x0 + 300, y0)]),  # same street split in two OSM ways
        _way(3, "Άλφα", [(x0 + 100, y0 - 100), (x0 + 100, y0 + 100)]),
        _way(4, "Βήτα", [(x0 + 200, y0 - 100), (x0 + 200, y0 + 100)]),
        _way(5, "Βόρεια", [(x0, y0 + 100), (x0 + 300, y0 + 100)]),
        _way(6, "Νότια", [(x0, y0 - 100), (x0 + 300, y0 - 100)]),
    ]


@pytest.fixture
def streets(grid_ways):
    return StreetIndex(grid_ways, aliases={"Alfa": "Άλφα"})


@pytest.fixture
def origin():
    return 480_000.0, 4_205_000.0


def strip(x, y, length=10.0, width=2.0):
    """A kerb strip centred on (x, y), running along x."""
    return Polygon([(x - length / 2, y - width / 2), (x + length / 2, y - width / 2), (x + length / 2, y + width / 2), (x - length / 2, y + width / 2)])
