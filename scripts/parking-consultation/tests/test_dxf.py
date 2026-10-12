import math

import ezdxf
from shapely.geometry import LineString

from ses.dxf import Sheet, boundary_polygon, count_texts, labelled_points, layer_shapes, split_by_lines, texts

FRAME = (0.0, 0.0, 1000.0, 1000.0)


def _sheet() -> Sheet:
    doc = ezdxf.new()
    msp = doc.modelspace()
    # A kerb strip: an open polyline 20 m long with a constant width of 3 m.
    msp.add_lwpolyline([(100, 100), (120, 100)], dxfattribs={"layer": "RES", "const_width": 3.0})
    # A closed outline without width, and an open line without width (not a shape).
    msp.add_lwpolyline([(200, 100), (210, 100), (210, 105), (200, 105)], close=True, dxfattribs={"layer": "RES"})
    msp.add_lwpolyline([(300, 100), (320, 100)], dxfattribs={"layer": "RES"})
    # A bay as a solid hatch with a polyline boundary, 2.25 × 5.5 m.
    bay = msp.add_hatch(dxfattribs={"layer": "BAY"})
    bay.paths.add_polyline_path([(400, 100), (402.25, 100), (402.25, 105.5), (400, 105.5)], is_closed=True)
    # A hatch whose boundary has an arc: a 10 × 4 m rectangle with a semicircle of radius 2 on its right.
    arched = msp.add_hatch(dxfattribs={"layer": "BAY"})
    edges = arched.paths.add_edge_path()
    edges.add_line((500, 100), (510, 100))
    edges.add_arc((510, 102), radius=2.0, start_angle=270, end_angle=90, ccw=True)
    edges.add_line((510, 104), (500, 104))
    edges.add_line((500, 104), (500, 100))
    # A zone as a solid hatch with an island: 100 × 100 m with a 10 × 10 m hole.
    zone = msp.add_hatch(dxfattribs={"layer": "ZONE"})
    zone.paths.add_polyline_path([(600, 100), (700, 100), (700, 200), (600, 200)], is_closed=True, flags=1)
    zone.paths.add_polyline_path([(640, 140), (650, 140), (650, 150), (640, 150)], is_closed=True, flags=0)
    # The study boundary and a stray copy of it far outside the frame.
    msp.add_lwpolyline([(0, 0), (900, 0), (900, 900), (0, 900)], close=True, dxfattribs={"layer": "LIMIT"})
    msp.add_lwpolyline([(5000, 5000), (5100, 5000), (5100, 5100)], close=True, dxfattribs={"layer": "LIMIT"})
    # Spot counts, one of them formatted, one not a number, one outside the frame.
    msp.add_mtext("3", dxfattribs={"layer": "N", "insert": (110, 102)})
    msp.add_mtext("\\P4", dxfattribs={"layer": "N", "insert": (205, 107)})
    msp.add_text("x", dxfattribs={"layer": "N", "insert": (115, 102)})
    msp.add_text("9", dxfattribs={"layer": "N", "insert": (5000, 5000)})
    msp.add_text("T A X I", dxfattribs={"layer": "ANY", "insert": (401, 102)})
    msp.add_text("14", dxfattribs={"layer": "NUM", "insert": (120, 110)})
    return Sheet(doc, FRAME, flatten_m=0.05)


def test_bands_outlines_and_hatches_become_polygons():
    sheet = _sheet()
    shapes = layer_shapes(sheet, {"RES": "residents", "BAY": "amea_shared", "ZONE": "zone"})
    residents = sorted(shapes["residents"], key=lambda p: p.area)
    assert len(residents) == 2
    assert math.isclose(residents[0].area, 50.0, rel_tol=0.01)  # the closed outline
    assert math.isclose(residents[1].area, 60.0, rel_tol=0.01)  # 20 m × 3 m band
    assert sheet.stats["open polylines without width"] == 1

    bays = sorted(shapes["amea_shared"], key=lambda p: p.area)
    assert math.isclose(bays[0].area, 2.25 * 5.5, rel_tol=0.01)
    assert math.isclose(bays[1].area, 40 + math.pi * 4 / 2, rel_tol=0.01)  # the arc is flattened, not dropped

    (zone,) = shapes["zone"]
    assert math.isclose(zone.area, 10_000 - 100, rel_tol=0.001)
    assert len(zone.interiors) == 1


def test_boundary_is_the_largest_shape_inside_the_frame():
    sheet = _sheet()
    boundary = boundary_polygon(sheet, "LIMIT")
    assert math.isclose(boundary.area, 900 * 900, rel_tol=0.001)
    assert sheet.stats["shapes outside the frame"] == 1


def test_counts_labels_and_house_numbers():
    sheet = _sheet()
    counts = count_texts(sheet, ["N"])
    assert sorted(value for value, _ in counts) == [3, 4]
    assert sheet.stats["count texts that are not a number"] == 1
    assert sheet.stats["texts outside the frame"] == 1
    assert [(label, round(point.x)) for label, point in labelled_points(sheet, {"TAXI": "taxi"})] == [("taxi", 401)]
    assert [(text, round(point.y)) for text, point in texts(sheet, {"NUM"})] == [("14", 110)]


def test_split_by_lines_cuts_a_corridor_into_street_sides():
    corridor = LineString([(0, 50), (100, 50)]).buffer(4, cap_style="flat")
    pieces = split_by_lines([corridor], [LineString([(0, 50), (100, 50)])])
    assert len(pieces) == 2
    assert all(math.isclose(p.area, 100 * 3.7, rel_tol=0.01) for p in pieces)
    assert {round(p.centroid.y, 1) for p in pieces} == {47.9, 52.1}
