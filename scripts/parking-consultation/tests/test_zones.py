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
