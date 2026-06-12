import type mapboxgl from 'mapbox-gl';
import type { MapOverlay } from '@/lib/map/types';

const OVERLAYS_SOURCE_ID = 'civic-overlays';
const FILL_LAYER_ID = 'civic-overlays-fill';
const LINE_LAYER_ID = 'civic-overlays-line';
const LABEL_LAYER_ID = 'civic-overlays-labels';

const DEFAULT_STROKE = '#1c1917';

export interface OverlaysLayerHandle {
    update(overlays: MapOverlay[]): void;
    destroy(): void;
}

function toFeatureCollection(overlays: MapOverlay[]): GeoJSON.FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: overlays.map(overlay => ({
            type: 'Feature' as const,
            geometry: overlay.geometry,
            properties: {
                id: overlay.id,
                fillColor: overlay.style?.fillColor ?? DEFAULT_STROKE,
                fillOpacity: overlay.style?.fillOpacity ?? 0,
                strokeColor: overlay.style?.strokeColor ?? DEFAULT_STROKE,
                strokeWidth: overlay.style?.strokeWidth ?? 1.2,
                strokeOpacity: overlay.style?.strokeOpacity ?? 0.7,
                label: overlay.style?.label ?? '',
            },
        })),
    };
}

/**
 * Quiet styled-geometry layers (boundaries, radii, …) under the subject
 * layers. Pure display: no events, per-feature styling from properties.
 */
export function attachOverlaysLayer(
    map: mapboxgl.Map,
    overlays: MapOverlay[],
    options: { beforeId?: string } = {},
): OverlaysLayerHandle {
    map.addSource(OVERLAYS_SOURCE_ID, {
        type: 'geojson',
        data: toFeatureCollection(overlays),
    });

    const beforeId = options.beforeId && map.getLayer(options.beforeId) ? options.beforeId : undefined;

    map.addLayer({
        id: FILL_LAYER_ID,
        type: 'fill',
        source: OVERLAYS_SOURCE_ID,
        filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
        paint: {
            'fill-color': ['get', 'fillColor'],
            'fill-opacity': ['get', 'fillOpacity'],
        },
    }, beforeId);

    map.addLayer({
        id: LINE_LAYER_ID,
        type: 'line',
        source: OVERLAYS_SOURCE_ID,
        filter: ['!=', ['geometry-type'], 'Point'],
        paint: {
            'line-color': ['get', 'strokeColor'],
            'line-width': ['get', 'strokeWidth'],
            'line-opacity': ['get', 'strokeOpacity'],
        },
    }, beforeId);

    map.addLayer({
        id: LABEL_LAYER_ID,
        type: 'symbol',
        source: OVERLAYS_SOURCE_ID,
        filter: ['!=', ['get', 'label'], ''],
        layout: {
            'text-field': ['get', 'label'],
            'text-size': 12,
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-max-width': 10,
        },
        paint: {
            'text-color': '#1c1917',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
        },
    }, beforeId);

    return {
        update(next: MapOverlay[]) {
            const source = map.getSource(OVERLAYS_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
            source?.setData(toFeatureCollection(next));
        },
        destroy() {
            if (!map.getStyle()) return;
            for (const layerId of [LABEL_LAYER_ID, LINE_LAYER_ID, FILL_LAYER_ID]) {
                if (map.getLayer(layerId)) map.removeLayer(layerId);
            }
            if (map.getSource(OVERLAYS_SOURCE_ID)) map.removeSource(OVERLAYS_SOURCE_ID);
        },
    };
}
