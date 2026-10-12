from shapely.geometry import LineString, Polygon

from ses.dxf import split_by_lines
from ses.units import build_units
from ses.zones import assign_zones, build_zone_polygons, validate_zones
from tests.conftest import strip


def test_zones_are_unions_of_blocks_holding_their_strips(streets, origin):
    x0, y0 = origin
    # Zone A colours the block north of the main street between Άλφα and Βήτα, zone B the block south of it.
    zone_strips = {
        "A": [strip(x0 + 130, y0 + 4), strip(x0 + 160, y0 + 4)],
        "B": [strip(x0 + 130, y0 - 4), strip(x0 + 160, y0 - 4)],
    }
    zones, stats = build_zone_polygons(streets, zone_strips)
    assert set(zones) == {"A", "B"}
    assert stats["unplaced_strips"] == {}
    assert 9_500 < zones["A"].area < 10_500  # one 100 × 100 block
    report, problems = validate_zones(zones, zone_strips)
    assert problems == []
    assert report["A"]["share"] == 1.0

    # One unit over zone A's strips (same kerb), one west of Άλφα where nothing is drawn.
    units, _ = build_units({"residents": [strip(x0 + 45, y0 + 4), strip(x0 + 130, y0 + 4)]}, streets)
    assign_zones(units, zone_strips, zones)
    by_from = {u.from_cross: u for u in units}
    assert by_from["Άλφα"].zone == "Α" and by_from["Άλφα"].zone_source == "p1-strips"
    assert by_from[None].zone is None  # west of Άλφα: no strips there and no polygon covers it


def test_corridor_pieces_weigh_blocks_by_area_and_the_boundary_fills_and_clips(streets, origin):
    x0, y0 = origin
    # Zone A is drawn kerb to kerb along Κύρια between Άλφα and Βήτα; cut along the centreline, its
    # north half lies in the block north of the street. Zone B has one small strip in that same block,
    # so by count the block would be contested, by area it is A's. The block south of the street holds
    # no piece but lies inside the study area, so it joins the zone next to it.
    corridor = LineString([(x0 + 100, y0), (x0 + 200, y0)]).buffer(4, cap_style="flat")
    north = [piece for piece in split_by_lines([corridor], streets.lines) if piece.centroid.y > y0]
    zone_strips = {"A": north, "B": [strip(x0 + 150, y0 + 20)]}
    boundary = Polygon([(x0 + 100, y0 - 50), (x0 + 200, y0 - 50), (x0 + 200, y0 + 100), (x0 + 100, y0 + 100)])
    zones, stats = build_zone_polygons(streets, zone_strips, weight="area", min_weight=1.0, boundary=boundary)
    assert set(zones) == {"A"}
    assert stats["contested_blocks"] == 0 and stats["filled_blocks"] == 1 and stats["unplaced_strips"] == {}
    assert 14_500 < zones["A"].area < 15_500  # both blocks, clipped at y = -50
    report, problems = validate_zones(zones, {"A": north})
    assert problems == [] and report["A"]["parts"] == 1


def test_a_unit_on_a_stretch_two_zones_share_names_both(streets, origin):
    x0, y0 = origin
    zone_strips = {"A": [strip(x0 + 130, y0 + 4)], "B": [strip(x0 + 130, y0 + 4)]}
    zones, _ = build_zone_polygons(streets, zone_strips, min_weight=1)
    units, _ = build_units({"residents": [strip(x0 + 130, y0 + 4)]}, streets)
    assign_zones(units, zone_strips, zones)
    assert units[0].zone == "Α-Β"
