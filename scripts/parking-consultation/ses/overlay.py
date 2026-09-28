"""Debug PNG: the extracted geometry over the OpenStreetMap streets, to eyeball the georeferencing."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw
from shapely.ops import unary_union

from .osm import StreetIndex

COLOURS = {
    "residents": (0, 64, 255, 210), "paid": (0, 222, 110, 210), "motorcycles": (0, 219, 219, 230), "excluded": (255, 222, 128, 230),
    "amea_shared": (255, 128, 0, 255), "amea_dedicated": (255, 0, 255, 255), "ev": (255, 0, 0, 255), "special": (230, 200, 0, 255),
    "zone_A": (102, 178, 255, 150), "zone_B": (128, 255, 191, 150), "zone_C": (222, 128, 255, 150), "zone_D": (255, 222, 128, 150),
}


def render_overlay(path: Path, streets: StreetIndex, layers: list[tuple[str, object]], outlines: list[object] = (), width: int = 2600, pad: float = 150.0) -> None:
    """layers: (category, ΕΓΣΑ87 geometry); outlines: polygons drawn as black borders (zones)."""
    everything = unary_union([g for _, g in layers] + list(outlines))
    minx, miny, maxx, maxy = everything.bounds
    minx -= pad
    miny -= pad
    maxx += pad
    maxy += pad
    scale = width / (maxx - minx)
    height = int((maxy - miny) * scale)

    def px(x, y):
        return (x - minx) * scale, (maxy - y) * scale

    image = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    draw = ImageDraw.Draw(image)
    for line in streets.lines:
        if line.intersects(everything.envelope):
            draw.line([px(*c) for c in line.coords], fill=(150, 150, 150, 255), width=3)

    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    ldraw = ImageDraw.Draw(layer)

    def draw_geom(geom, fill=None, outline=None, width_px=1):
        if geom.geom_type == "Polygon":
            ldraw.polygon([px(*c) for c in geom.exterior.coords], fill=fill, outline=outline)
        elif geom.geom_type in ("MultiPolygon", "GeometryCollection"):
            for part in geom.geoms:
                draw_geom(part, fill, outline, width_px)
        elif geom.geom_type == "Point":
            x, y = px(geom.x, geom.y)
            ldraw.ellipse([x - 5, y - 5, x + 5, y + 5], fill=fill, outline=(0, 0, 0, 255))
        elif geom.geom_type in ("LineString", "LinearRing", "MultiLineString"):
            parts = geom.geoms if geom.geom_type == "MultiLineString" else [geom]
            for part in parts:
                ldraw.line([px(*c) for c in part.coords], fill=outline, width=width_px)

    for category, geom in layers:
        draw_geom(geom, fill=COLOURS.get(category, (120, 120, 120, 200)))
    for polygon in outlines:
        draw_geom(polygon.exterior if polygon.geom_type == "Polygon" else polygon.boundary, outline=(0, 0, 0, 255), width_px=4)
    image = Image.alpha_composite(image, layer)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(path)
