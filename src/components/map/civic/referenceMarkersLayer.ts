import mapboxgl from 'mapbox-gl';
import type { MapReferenceMarker } from '@/lib/map/types';

/**
 * Draws labelled reference dots — address-search / geolocate results and a
 * picked location — as plain DOM markers, returning a cleanup that removes
 * them. These aren't part of the subject/cluster pipeline (they're transient
 * pins the page drops on the map), so they live as their own tiny layer rather
 * than in the GPU symbol layers. Built from DOM nodes (label via textContent)
 * rather than innerHTML so a label can't inject markup.
 */
export function renderReferenceMarkers(map: mapboxgl.Map, markers: MapReferenceMarker[]): () => void {
    const created = markers
        .filter(marker => Number.isFinite(marker.coordinates[0]) && Number.isFinite(marker.coordinates[1]))
        .map(definition => {
            const color = definition.color ?? '#0c0a09';

            const element = document.createElement('div');
            element.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:none;';

            const dot = document.createElement('div');
            dot.style.width = '14px';
            dot.style.height = '14px';
            dot.style.borderRadius = '50%';
            dot.style.background = color;
            dot.style.border = '2px solid #ffffff';
            dot.style.boxShadow = `0 0 0 2px ${color}4d, 0 1px 3px rgb(0 0 0 / 0.3)`;
            element.appendChild(dot);

            if (definition.label) {
                const label = document.createElement('div');
                label.style.cssText =
                    'font-size:12px;font-weight:600;color:#1c1917;white-space:nowrap;' +
                    'text-shadow:0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff';
                label.textContent = definition.label;
                element.appendChild(label);
            }

            return new mapboxgl.Marker({ element, anchor: definition.label ? 'top' : 'center' })
                .setLngLat(definition.coordinates)
                .addTo(map);
        });

    return () => {
        for (const marker of created) marker.remove();
    };
}
