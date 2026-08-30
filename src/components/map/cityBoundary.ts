import type { MapFeature } from '@/components/map/map';

/**
 * The brand outline a covered δήμος wears on every subject map — the landing,
 * the city map tab, the meeting map, and the meeting page's decorative band.
 * One builder, because four hand-copies of this style had already drifted
 * (0.03 vs 0.04 fill) before it existed. 0.03 is the landing's shipped value.
 */
export function cityBoundaryFeature(id: string, geometry: MapFeature['geometry']): MapFeature {
    return {
        id,
        geometry,
        properties: { featureType: 'city', interactive: false },
        style: {
            fillColor: 'hsl(24, 100%, 50%)',
            fillOpacity: 0.03,
            strokeColor: 'hsl(24, 100%, 50%)',
            strokeWidth: 1.5,
            strokeOpacity: 0.9,
        },
    };
}
