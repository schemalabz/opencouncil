from shapely.geometry import Polygon

from ses.ids import assign_spot_ids
from ses.spots import apply_table_counts, cluster_spots, name_spots


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
