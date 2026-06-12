import type mapboxgl from 'mapbox-gl';
import type { ExpressionSpecification } from 'mapbox-gl';
import { MUNICIPALITIES_SOURCE_ID } from '@/lib/map/constants';
import type { MapMunicipality } from '@/lib/map/types';

const FILL_LAYER_ID = 'civic-muni-fill';
const LINE_LAYER_ID = 'civic-muni-line';
const LABEL_LAYER_ID = 'civic-muni-labels';

// Design tokens (see DESIGN.md): Graphite for supported boundaries; the
// petition heat is a quantized Stone Mist → Marble Blue ramp — cool and
// institutional, deliberately not a warm "alert" ramp.
const GRAPHITE = '#1c1917';
const SOFT_INK = '#57534e';
const MARBLE_BLUE = '#a4c0e1';
const MARBLE_BLUE_DEEP = '#7d9bc4';

// Boundaries belong to low zooms; high zoom belongs to subjects.
const BOUNDARY_FADE_START_ZOOM = 11;
const BOUNDARY_FADE_END_ZOOM = 12.5;

const hoverExpression: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false];
const supportedExpression: ExpressionSpecification = ['boolean', ['get', 'officialSupport'], false];

/** Quantized petition ramp: 1–4 / 5–14 / 15–39 / 40–99 / 100+ */
const petitionFillColor: ExpressionSpecification = [
    'step', ['get', 'petitionCount'],
    MARBLE_BLUE, // 0 petitions — only visible as a hover wash
    1, '#f5f5f4',
    5, '#e2e8f1',
    15, '#cdd9ea',
    40, '#b8cce6',
    100, MARBLE_BLUE,
];

function zoomFaded(baseExpression: ExpressionSpecification | number): ExpressionSpecification {
    return [
        'interpolate', ['linear'], ['zoom'],
        BOUNDARY_FADE_START_ZOOM, baseExpression,
        BOUNDARY_FADE_END_ZOOM, 0,
    ] as ExpressionSpecification;
}

function toFeatureCollection(municipalities: MapMunicipality[]): GeoJSON.FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: municipalities
            .filter(municipality => municipality.geometry)
            .map(municipality => ({
                type: 'Feature' as const,
                geometry: municipality.geometry as GeoJSON.Geometry,
                properties: {
                    id: municipality.id,
                    name: municipality.name,
                    officialSupport: municipality.officialSupport,
                    petitionCount: municipality.petitionCount,
                },
            })),
    };
}

export interface MunicipalitiesLayerOptions {
    interactive: boolean;
    onClick?: (municipalityId: string) => void;
    onHoverChange?: (municipalityId: string | null) => void;
}

export interface MunicipalitiesLayerHandle {
    update(municipalities: MapMunicipality[]): void;
    destroy(): void;
}

/**
 * Adds the municipalities source and its fill/line/label layers.
 * Supported cities: quiet graphite boundary, no fill. Unsupported cities:
 * petition-count heat fill, invisible at rest when unpetitioned, with a
 * Marble Blue hover wash. Everything fades out as subjects take over at
 * high zoom.
 */
export function attachMunicipalitiesLayer(
    map: mapboxgl.Map,
    municipalities: MapMunicipality[],
    options: MunicipalitiesLayerOptions,
): MunicipalitiesLayerHandle {
    map.addSource(MUNICIPALITIES_SOURCE_ID, {
        type: 'geojson',
        data: toFeatureCollection(municipalities),
        promoteId: 'id',
    });

    map.addLayer({
        id: FILL_LAYER_ID,
        type: 'fill',
        source: MUNICIPALITIES_SOURCE_ID,
        paint: {
            'fill-color': [
                'case',
                supportedExpression, GRAPHITE,
                petitionFillColor,
            ],
            'fill-opacity': zoomFaded([
                'case',
                supportedExpression,
                ['case', hoverExpression, 0.06, 0],
                ['>', ['get', 'petitionCount'], 0],
                ['case', hoverExpression, 0.62, 0.45],
                ['case', hoverExpression, 0.12, 0],
            ]),
        },
    });

    map.addLayer({
        id: LINE_LAYER_ID,
        type: 'line',
        source: MUNICIPALITIES_SOURCE_ID,
        paint: {
            'line-color': [
                'case',
                supportedExpression, GRAPHITE,
                MARBLE_BLUE_DEEP,
            ],
            'line-width': [
                'case',
                supportedExpression,
                ['case', hoverExpression, 1.8, 1.2],
                ['case', hoverExpression, 1.5, 0],
            ],
            'line-opacity': zoomFaded([
                'case',
                supportedExpression, 0.5,
                1,
            ]),
        },
    });

    map.addLayer({
        id: LABEL_LAYER_ID,
        type: 'symbol',
        source: MUNICIPALITIES_SOURCE_ID,
        minzoom: 6,
        layout: {
            'text-field': ['get', 'name'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 6, 11, 10, 13],
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-max-width': 8,
            'text-padding': 6,
        },
        paint: {
            'text-color': ['case', supportedExpression, GRAPHITE, SOFT_INK],
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
            // Supported city names anchor the low-zoom map; unsupported names
            // appear only on hover.
            'text-opacity': zoomFaded([
                'case',
                supportedExpression, 1,
                ['case', hoverExpression, 1, 0],
            ]),
        },
    });

    let hoveredId: string | null = null;

    const setHovered = (id: string | null) => {
        if (id === hoveredId) return;
        if (hoveredId !== null) {
            map.setFeatureState({ source: MUNICIPALITIES_SOURCE_ID, id: hoveredId }, { hover: false });
        }
        if (id !== null) {
            map.setFeatureState({ source: MUNICIPALITIES_SOURCE_ID, id }, { hover: true });
        }
        hoveredId = id;
        map.getCanvas().style.cursor = id !== null ? 'pointer' : '';
        options.onHoverChange?.(id);
    };

    const onMouseMove = (event: mapboxgl.MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        setHovered(feature?.id != null ? String(feature.id) : null);
    };
    const onMouseLeave = () => setHovered(null);
    const onClick = (event: mapboxgl.MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (feature?.id != null) {
            options.onClick?.(String(feature.id));
        }
    };

    if (options.interactive) {
        map.on('mousemove', FILL_LAYER_ID, onMouseMove);
        map.on('mouseleave', FILL_LAYER_ID, onMouseLeave);
        map.on('click', FILL_LAYER_ID, onClick);
    }

    return {
        update(next: MapMunicipality[]) {
            const source = map.getSource(MUNICIPALITIES_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
            source?.setData(toFeatureCollection(next));
        },
        destroy() {
            if (options.interactive) {
                map.off('mousemove', FILL_LAYER_ID, onMouseMove);
                map.off('mouseleave', FILL_LAYER_ID, onMouseLeave);
                map.off('click', FILL_LAYER_ID, onClick);
            }
            if (!map.getStyle()) return;
            for (const layerId of [LABEL_LAYER_ID, LINE_LAYER_ID, FILL_LAYER_ID]) {
                if (map.getLayer(layerId)) map.removeLayer(layerId);
            }
            if (map.getSource(MUNICIPALITIES_SOURCE_ID)) map.removeSource(MUNICIPALITIES_SOURCE_ID);
        },
    };
}
