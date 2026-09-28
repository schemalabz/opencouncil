"""Coordinate systems. The drawings are in ΕΓΣΑ87 (EPSG:2100); the app wants WGS84.

The datum shift is spelled out so Python and the TypeScript scripts (proj4 with the same +towgs84)
land on the same WGS84 coordinates.
"""
from pyproj import CRS, Transformer
from shapely.ops import transform as shapely_transform

EGSA87 = CRS.from_proj4(
    "+proj=tmerc +lat_0=0 +lon_0=24 +k=0.9996 +x_0=500000 +y_0=0 +ellps=GRS80 "
    "+towgs84=-199.87,74.79,246.62,0,0,0,0 +units=m +no_defs"
)
WGS84 = CRS.from_epsg(4326)

_to_wgs84 = Transformer.from_crs(EGSA87, WGS84, always_xy=True)
_from_wgs84 = Transformer.from_crs(WGS84, EGSA87, always_xy=True)


def to_wgs84(x: float, y: float) -> tuple[float, float]:
    return _to_wgs84.transform(x, y)


def from_wgs84(lon: float, lat: float) -> tuple[float, float]:
    return _from_wgs84.transform(lon, lat)


def geom_to_wgs84(geom):
    return shapely_transform(lambda x, y, z=None: _to_wgs84.transform(x, y), geom)


def geom_from_wgs84(geom):
    return shapely_transform(lambda x, y, z=None: _from_wgs84.transform(x, y), geom)
