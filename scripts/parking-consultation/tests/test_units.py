import pytest
from shapely.geometry import Point

from ses.ids import assign_unit_ids, check_unique
from ses.units import build_units, estimated_spots
from tests.conftest import strip


def test_same_named_ways_are_merged_so_blocks_span_way_boundaries(streets):
    assert len(streets.find("Κύρια")) == 1
    assert streets.lines[streets.find("Κύρια")[0]].length == pytest.approx(300, abs=0.01)


def test_aliases_resolve_to_canonical_names(streets):
    assert streets.canonical("alfa") == "Άλφα"
    assert streets.find("ALFA") == streets.find("Άλφα")


def test_strips_group_into_block_sides_with_canonical_direction(streets, origin):
    x0, y0 = origin
    # Two strips north of the main street between Άλφα and Βήτα, one strip south, one west of Άλφα.
    shapes = {"residents": [strip(x0 + 130, y0 + 4), strip(x0 + 170, y0 + 4), strip(x0 + 150, y0 - 4), strip(x0 + 50, y0 + 4)]}
    units, orphans = build_units(shapes, streets)
    assert orphans == []
    assert len(units) == 3
    by_key = {(u.from_cross, u.to_cross, u.side): u for u in units}
    # Eastward is canonical: from Άλφα to Βήτα, north is the left side.
    north = by_key[("Άλφα", "Βήτα", "l")]
    assert len(north.strips) == 2 and north.length_m == 20.0
    assert ("Άλφα", "Βήτα", "r") in by_key
    west = by_key[(None, "Άλφα", "l")]
    assert west.street == "Κύρια"


def test_strip_far_from_every_street_is_an_orphan(streets, origin):
    x0, y0 = origin
    units, orphans = build_units({"paid": [strip(x0 + 150, y0 + 60)]}, streets, max_way_distance=12.0)
    assert units == [] and len(orphans) == 1


def test_ids_are_stable_and_collisions_get_suffixes(streets, origin):
    x0, y0 = origin
    units, _ = build_units({"residents": [strip(x0 + 130, y0 + 4), strip(x0 + 150, y0 - 4)]}, streets)
    assign_unit_ids(units, aliases={})
    assert sorted(u.id for u in units) == ["res-kyria-alfa-vita-l", "res-kyria-alfa-vita-r"]
    # An alias pins a renamed unit to the id comments already reference.
    assign_unit_ids(units, aliases={"res-kyria-alfa-vita-l": "res-old-id"})
    assert "res-old-id" in {u.id for u in units}
    assert check_unique([u.id for u in units]) == []
    twin = units[0]
    twin.id = ""
    assign_unit_ids([units[0], units[0]], aliases={})
    assert units[0].id.endswith("-2")


def test_estimated_spots_uses_area(streets, origin):
    x0, y0 = origin
    units, _ = build_units({"residents": [strip(x0 + 130, y0 + 4, length=55.0, width=2.0)]}, streets)
    assert estimated_spots(units[0], {"residents": 11.0}) == 10
    assert estimated_spots(units[0], {"residents": 0}) == 0


def test_nearest_street_and_cross(streets, origin):
    x0, y0 = origin
    assert streets.nearest_street_and_cross(Point(x0 + 105, y0 + 3), 25.0) == ("Κύρια", "Άλφα")


def test_plot_fragments_that_share_an_edge_become_one_strip():
    from shapely.geometry import Polygon
    from ses.units import join_plot_fragments

    # A 20 × 2 m strip plotted as two triangles, and a whole strip that touches its end.
    lower = Polygon([(0, 0), (20, 0), (20, 2)])
    upper = Polygon([(0, 0), (20, 2), (0, 2)])
    touching = Polygon([(20, 0), (30, 0), (30, 2), (20, 2)])
    joined = join_plot_fragments([lower, touching, upper])
    assert len(joined) == 2
    assert sorted(round(p.area) for p in joined) == [20, 40]
