import pymupdf
from shapely.geometry import Polygon
from shapely.ops import unary_union

from ses.pdf import path_rings


def line(a, b):
    return ("l", pymupdf.Point(*a), pymupdf.Point(*b))


def test_two_triangles_in_one_path_make_two_rings_and_one_rectangle():
    # A 10 × 2 rectangle plotted as two triangles in one path, the way AutoCAD fills a strip.
    items = [
        line((0, 0), (10, 0)), line((10, 0), (10, 2)), line((10, 2), (0, 0)),
        line((0, 0), (10, 2)), line((10, 2), (0, 2)), line((0, 2), (0, 0)),
    ]
    rings = path_rings(items)
    assert len(rings) == 2
    assert all(len(ring) == 3 for ring in rings)
    shape = unary_union([Polygon(ring) for ring in rings])
    assert shape.geom_type == "Polygon"
    assert abs(shape.area - 20) < 1e-9


def test_a_sub_path_starts_where_the_next_line_does_not_continue():
    items = [
        line((0, 0), (4, 0)), line((4, 0), (4, 1)), line((4, 1), (0, 0)),
        line((5, 0), (9, 0)), line((9, 0), (9, 1)),
    ]
    rings = path_rings(items)
    assert rings == [[(0, 0), (4, 0), (4, 1)], [(5, 0), (9, 0), (9, 1)]]


def test_rectangles_and_quads_are_rings_of_their_own():
    rect = ("re", pymupdf.Rect(0, 0, 2, 1), 1)
    quad = ("qu", pymupdf.Rect(3, 0, 5, 1).quad)
    rings = path_rings([rect, quad])
    assert len(rings) == 2
    assert Polygon(rings[1]).area == 2
