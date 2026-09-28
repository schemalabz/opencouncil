from ses.segments import parse_segment, segments_from_table, units_on_segment
from ses.units import build_units
from tests.conftest import strip


def test_segment_rows_parse_both_forms():
    assert parse_segment("Ασπασίας (από Κύπρου έως Αναστάσεως)").from_cross == "Κύπρου"
    whole = parse_segment("Ρόδων (κάθετη σε Π.Τσαλδάρη, μεταξύ Χίου & Μενίππου)", "Ιδιωτική οδός")
    assert whole.street == "Ρόδων" and whole.from_cross is None and whole.note == "Ιδιωτική οδός"
    rows = segments_from_table({"rows": [["1", "Κύρια (από Άλφα έως Βήτα)"], ["", ""]]})
    assert [(s.street, s.from_cross, s.to_cross) for s in rows] == [("Κύρια", "Άλφα", "Βήτα")]


def test_units_between_two_crossings_match(streets, origin):
    x0, y0 = origin
    units, _ = build_units({"residents": [strip(x0 + 150, y0 + 4), strip(x0 + 250, y0 + 4)]}, streets)
    matched, reason = units_on_segment(parse_segment("Κύρια (από Άλφα έως Βήτα)"), units, streets)
    assert reason is None and [u.from_cross for u in matched] == ["Άλφα"]
    _, reason = units_on_segment(parse_segment("Άγνωστη (από Άλφα έως Βήτα)"), units, streets)
    assert "not in OSM" in reason
