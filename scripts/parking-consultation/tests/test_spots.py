import pytest
from shapely.geometry import Point, Polygon

import ses.spots
from ses.ids import assign_spot_ids
from ses.spots import ADDRESS_RE, apply_table_counts, cluster_spots, label_spots, name_spots


def square(x, y, size=1.0):
    return Polygon([(x, y), (x + size, y), (x + size, y + size), (x, y + size)])


def test_symbol_parts_within_the_radius_form_one_spot():
    parts = [square(0, 0), square(1.5, 0), square(0, 1.5), square(30, 30)]
    spots = cluster_spots("amea_shared", parts, cluster_radius=2.0)
    assert sorted(s.parts for s in spots) == [1, 3]
    assert all(s.n_spots == 1 for s in spots)


def test_table_rows_give_counts_and_addresses(streets, origin):
    x0, y0 = origin
    spots = cluster_spots("amea_shared", [square(x0 + 103, y0 + 2), square(x0 + 203, y0 + 2)])
    name_spots(spots, streets)
    rows = [["ΚΥΡΙΑ (διαστ. με Βήτα)", "3"], ["ΚΥΡΙΑ (διαστ. με Βόρεια)", "1"], ["ΣΥΝΟΛΟ", "4"]]
    unmatched = apply_table_counts(spots, rows, streets)
    assert unmatched == ["ΚΥΡΙΑ (διαστ. με Βόρεια)"]  # a real street, but no spot at that corner
    matched = next(s for s in spots if s.address)
    assert matched.cross == "Βήτα" and matched.n_spots == 3
    assign_spot_ids(spots, aliases={})
    assert sorted(s.id for s in spots) == ["amea-kyria-alfa", "amea-kyria-vita"]


@pytest.mark.parametrize("address, groups", [
    ("ΦΑΝΕΡΩΜΕΝΗΣ 4", ("ΦΑΝΕΡΩΜΕΝΗΣ", "4", None, None)),
    ("ΕΛ. ΒΕΝΙΖΕΛΟΥ 36-38", ("ΕΛ. ΒΕΝΙΖΕΛΟΥ", "36-38", None, None)),
    ("17ης ΝΟΕΜΒΡΙΟΥ 6", ("17ης ΝΟΕΜΒΡΙΟΥ", "6", None, None)),
    ("ΑΡΚΑΔΙΟΥ 20 ΚΑΙ ΜΕΝΙΠΠΟΥ 41", ("ΑΡΚΑΔΙΟΥ", "20", "ΜΕΝΙΠΠΟΥ", None)),
    ("ΠΥΘΑΓΟΡΑ 13 ΚΑΙ ΧΙΟΥ", ("ΠΥΘΑΓΟΡΑ", "13", "ΧΙΟΥ", None)),
    ("ΠΑΡ. ΜΕΣΟΓΕΙΩΝ (μεταξύ Σαρανταπόρου και Υμηττού)", ("ΜΕΣΟΓΕΙΩΝ", None, None, "μεταξύ Σαρανταπόρου και Υμηττού")),
    ("ΒΟΥΤΣΙΝΑ (πλ. Δημοκρατίας) – Θέση ΣΦΗΟ", ("ΒΟΥΤΣΙΝΑ", None, None, "πλ. Δημοκρατίας")),
])
def test_address_rows_parse_into_street_number_cross_and_hint(address, groups):
    assert ADDRESS_RE.match(address).groups() == groups


def test_numbered_rows_take_the_spot_nearest_their_house_number(streets, origin):
    x0, y0 = origin
    # Two dedicated ΑΜΕΑ spots on Κύρια; the drawing writes house numbers 8, 15 and 17 beside the street.
    spots = cluster_spots("amea_dedicated", [square(x0 + 120, y0 + 2), square(x0 + 140, y0 + 2)])
    name_spots(spots, streets)
    numbers = [("8", Point(x0 + 118, y0 + 6)), ("15", Point(x0 + 138, y0 + 6)), ("17", Point(x0 + 142, y0 + 6)), ("8", Point(x0 + 118, y0 + 90))]
    rows = [["ΚΥΡΙΑ 8", "1"], ["ΚΥΡΙΑ 15", "2"], ["ΚΥΡΙΑ 17", "2", "Για το ιατρείο."]]
    unmatched = apply_table_counts(spots, rows, streets, numbers)
    # The nearest row-spot pairs win in order, so rows read later cannot take a spot from an earlier one.
    west, east = sorted(spots, key=lambda s: s.point.x)
    assert (west.address, west.n_spots) == ("ΚΥΡΙΑ 8", 1)
    assert (east.address, east.n_spots, east.note) == ("ΚΥΡΙΑ 17", 2, "Για το ιατρείο.")
    assert unmatched == ["ΚΥΡΙΑ 15"]


def test_a_hint_with_no_spot_at_that_corner_takes_the_spot_nearest_the_crossing(streets, origin, monkeypatch):
    x0, y0 = origin
    spots = cluster_spots("amea_shared", [square(x0 + 145, y0 + 2)])
    name_spots(spots, streets)
    assert spots[0].cross == "Άλφα"  # 45 m from Άλφα, 55 m from Βήτα
    monkeypatch.setattr(ses.spots, "CROSSING_MAX_DISTANCE_M", 60.0)
    assert apply_table_counts(spots, [["ΚΥΡΙΑ (διαστ. με Βήτα)", "2"]], streets) == []
    assert spots[0].n_spots == 2


def test_labels_written_on_a_spot(streets, origin):
    x0, y0 = origin
    spots = cluster_spots("special", [square(x0 + 120, y0 + 2), square(x0 + 160, y0 + 2)])
    label_spots(spots, [("TAXI", Point(x0 + 121, y0 + 3)), ("TAXI", Point(x0 + 140, y0 + 40))])
    assert [s.label for s in sorted(spots, key=lambda s: s.point.x)] == ["TAXI", None]
