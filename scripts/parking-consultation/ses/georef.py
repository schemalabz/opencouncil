"""Georeference a plotted sheet: fit page coordinates to ΕΓΣΑ87 from street labels vs OSM streets.

The sheet has no coordinate grid. Its street labels sit on the streets they name, so a similarity
transform (rotation, scale, translation) is found by minimising the distance from each transformed
label to the OSM line of that street. Labels whose text matches several streets are left out.
"""
from __future__ import annotations

import math
from collections import Counter
from dataclasses import asdict, dataclass

import numpy as np
from scipy.optimize import least_squares
from shapely.geometry import Point

from .osm import StreetIndex

POINTS_PER_METRE_AT_1_2000 = 0.7056  # 1 pt = 0.3528 mm on paper, ×2000
SKIP_WORDS = {"ΖΩΝΗ", "ΠΛΑΤΕΙΑ", "ΧΩΡΟΣ", "ΝΟΣΟΚΟΜΕΙΟΥ", "ΓΕΝΝΗΜΑΤΑΣ", "ΓΕΩΡΓΙΟΣ", "ΛΕΩΦΟΡΟΣ", "ΙΕΡΟΣ", "ΝΑΟΣ", "ΠΟΛΕΩΣ", "ΤΙΤΛΟΣ", "ΙΩΑΝΝΟΥ", "ΑΓΙΟΥ"}


@dataclass
class Similarity:
    theta: float
    scale: float
    tx: float
    ty: float

    def apply(self, x: float, y_down: float) -> tuple[float, float]:
        y = -y_down
        c, s = math.cos(self.theta), math.sin(self.theta)
        return self.scale * (c * x - s * y) + self.tx, self.scale * (s * x + c * y) + self.ty

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "Similarity":
        return cls(data["theta"], data["scale"], data["tx"], data["ty"])


class IdentityTransform:
    """For a DXF already in ΕΓΣΑ87."""

    def apply(self, x: float, y: float) -> tuple[float, float]:
        return x, y


def match_labels(labels: list[tuple[float, float, str]], streets: StreetIndex, skip_words: set[str] = SKIP_WORDS) -> list[tuple[float, float, list[int], str]]:
    """Label fragments that are a word-prefix of exactly one street name: (x, y, way indexes, text)."""
    by_norm: dict[str, list[int]] = {}
    for index, norm_name in enumerate(streets.norm_names):
        by_norm.setdefault(norm_name, []).append(index)
    matches = []
    for x, y, text in labels:
        if text in skip_words:
            continue
        candidates = [name for name in by_norm if any(word.startswith(text) for word in name.split())]
        if len(candidates) != 1:
            continue
        # A street may be several merged parts; the objective uses the nearest part.
        matches.append((x, y, by_norm[candidates[0]], text))
    return matches


def _residuals(params, points: np.ndarray, targets: list[list[int]], streets: StreetIndex) -> np.ndarray:
    theta, scale, tx, ty = params
    c, s = math.cos(theta), math.sin(theta)
    xs = scale * (c * points[:, 0] - s * points[:, 1]) + tx
    ys = scale * (s * points[:, 0] + c * points[:, 1]) + ty
    return np.array([min(streets.lines[i].distance(Point(xs[k], ys[k])) for i in targets[k]) for k in range(len(targets))])


def fit_similarity(labels: list[tuple[float, float, str]], streets: StreetIndex, scale_hint: float = POINTS_PER_METRE_AT_1_2000) -> tuple[Similarity, dict]:
    matched = match_labels(labels, streets)
    if len(matched) < 12:
        raise RuntimeError(f"only {len(matched)} labels matched a street; the sheet cannot be georeferenced")
    points = np.array([[x, -y] for x, y, _, _ in matched])
    targets = [ways for _, _, ways, _ in matched]
    centroids = np.array([[streets.lines[ways[0]].centroid.x, streets.lines[ways[0]].centroid.y] for ways in targets])

    # Rotation is unknown: grid-search it with the translation that aligns the medians, then refine.
    best = None
    for degrees in range(0, 360, 2):
        theta = math.radians(degrees)
        c, s = math.cos(theta), math.sin(theta)
        xs = scale_hint * (c * points[:, 0] - s * points[:, 1])
        ys = scale_hint * (s * points[:, 0] + c * points[:, 1])
        tx, ty = float(np.median(centroids[:, 0] - xs)), float(np.median(centroids[:, 1] - ys))
        score = float(np.median(_residuals((theta, scale_hint, tx, ty), points, targets, streets)))
        if best is None or score < best[0]:
            best = (score, theta, tx, ty)

    params = np.array([best[1], scale_hint, best[2], best[3]])
    keep = np.ones(len(points), dtype=bool)
    residuals = np.zeros(len(points))
    for _ in range(4):
        subset_targets = [t for t, k in zip(targets, keep) if k]
        result = least_squares(lambda p: _residuals(p, points[keep], subset_targets, streets), params, loss="soft_l1", f_scale=10.0)
        params = result.x
        residuals = _residuals(params, points, targets, streets)
        keep = residuals < max(15.0, 3 * float(np.median(residuals[keep])))

    similarity = Similarity(float(params[0]), float(params[1]), float(params[2]), float(params[3]))
    kept = residuals[keep]
    stats = {
        "labels": len(labels),
        "matched": len(matched),
        "kept": int(keep.sum()),
        "median_m": round(float(np.median(kept)), 2),
        "rms_m": round(float(np.sqrt(np.mean(kept ** 2))), 2),
        "p90_m": round(float(np.percentile(kept, 90)), 2),
        "rotation_deg": round(math.degrees(similarity.theta), 3),
        "scale_m_per_pt": round(similarity.scale, 5),
        "dropped": Counter(text for (_, _, _, text), k in zip(matched, keep) if not k).most_common(10),
    }
    return similarity, stats
