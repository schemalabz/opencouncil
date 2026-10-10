"""GeoJSON files in WGS84 with 7-decimal coordinates; geometry is ΕΓΣΑ87 in memory."""
from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import mapping, shape

from .crs import geom_from_wgs84, geom_to_wgs84


def _round(coords, decimals: int = 7):
    if isinstance(coords, (list, tuple)):
        if coords and isinstance(coords[0], (int, float)):
            return [round(float(c), decimals) for c in coords]
        return [_round(c, decimals) for c in coords]
    return coords


def write_features(path: Path, features: list[tuple[object, dict]]) -> None:
    """features: (ΕΓΣΑ87 shapely geometry, properties). Written as WGS84."""
    collection = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": props,
                "geometry": {**mapping(geom_to_wgs84(geom)), "coordinates": _round(mapping(geom_to_wgs84(geom))["coordinates"])},
            }
            for geom, props in features
        ],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(collection, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def read_features(path: Path) -> list[tuple[object, dict]]:
    """Back to ΕΓΣΑ87 shapely geometries."""
    collection = json.loads(path.read_text(encoding="utf-8"))
    return [(geom_from_wgs84(shape(f["geometry"])), f.get("properties", {})) for f in collection["features"]]
