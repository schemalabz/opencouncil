import math

from ses.georef import Similarity, fit_similarity
from ses.text import normalize


def test_a_known_similarity_is_recovered_from_labels_on_streets(streets):
    truth = Similarity(theta=math.radians(38.0), scale=0.7, tx=480_050.0, ty=4_204_950.0)
    labels = []
    # Put 24 label points on the streets, then express them in page coordinates (y down) via the inverse.
    c, s = math.cos(truth.theta), math.sin(truth.theta)
    for way, name in zip(streets.lines, streets.names):
        for fraction in (0.15, 0.4, 0.6, 0.85):
            point = way.interpolate(fraction, normalized=True)
            dx, dy = (point.x - truth.tx) / truth.scale, (point.y - truth.ty) / truth.scale
            x, y = c * dx + s * dy, -s * dx + c * dy
            labels.append((x, -y, normalize(name)[:4]))
    fitted, stats = fit_similarity(labels, streets, scale_hint=0.7)
    assert abs(fitted.scale - truth.scale) < 0.001
    assert abs(math.degrees(fitted.theta - truth.theta)) < 0.05
    assert math.hypot(fitted.tx - truth.tx, fitted.ty - truth.ty) < 0.2
    assert stats["median_m"] < 0.1
