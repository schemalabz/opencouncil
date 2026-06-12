import mapboxgl from 'mapbox-gl';
import { DONUT_MIN_HIT_AREA_PX, SUBJECTS_SOURCE_ID } from '@/lib/map/constants';
import { computeDonutSegments, donutSvg } from '@/lib/map/donut';
import type { PinTopic } from './pinImages';

/**
 * Renders donut clusters as pooled HTML markers, synced on the map's render
 * loop (the canonical mapbox approach — topic-segmented rings aren't
 * expressible as style layers). Marker DOM is only rebuilt when a cluster's
 * count/topic signature changes, so panning never churns the DOM.
 */

export interface DonutMarkerPoolOptions {
    topics: PinTopic[];
    /** Accessible label for a cluster button. */
    clusterAriaLabel: (count: number) => string;
    reducedMotion: boolean;
    /** Clustering ceiling — clusters that outlive it hand off to onUnexpandable. */
    clusterMaxZoom: number;
    /**
     * A cluster that zooming cannot split (its members sit closer than the
     * cluster radius even at clusterMaxZoom — usually the same address).
     * The map decides whether to spiderfy or just zoom past the ceiling.
     */
    onUnexpandable?: (subjectIds: string[], lngLat: [number, number]) => void;
}

export interface DonutMarkerPool {
    setTopics(topics: PinTopic[]): void;
    destroy(): void;
}

interface PooledMarker {
    marker: mapboxgl.Marker;
    element: HTMLButtonElement;
    signature: string;
}

export function createDonutMarkerPool(map: mapboxgl.Map, options: DonutMarkerPoolOptions): DonutMarkerPool {
    let topics = options.topics;
    const pool = new Map<number, PooledMarker>();

    function segmentTopics(): { id: string; colorHex: string }[] {
        return topics
            .filter((topic): topic is PinTopic & { id: string } => topic.id !== null)
            .map(topic => ({ id: topic.id, colorHex: topic.colorHex }));
    }

    function clusterSignature(pointCount: number, properties: Record<string, unknown>): string {
        const counts = segmentTopics().map(topic => properties[`t_${topic.id}`] ?? 0);
        return `${pointCount}:${counts.join(',')}`;
    }

    function renderInto(element: HTMLButtonElement, pointCount: number, properties: Record<string, unknown>) {
        const segments = computeDonutSegments(properties, segmentTopics(), pointCount);
        element.innerHTML =
            `<div style="border-radius:50%;box-shadow:0 1px 3px rgb(0 0 0 / 0.25);line-height:0">` +
            donutSvg(segments, pointCount) +
            `</div>`;
        element.setAttribute('aria-label', options.clusterAriaLabel(pointCount));
    }

    function createElementFor(clusterId: number, pointCount: number, properties: Record<string, unknown>): HTMLButtonElement {
        const element = document.createElement('button');
        element.type = 'button';
        element.style.cssText =
            `display:grid;place-items:center;background:none;border:0;padding:0;cursor:pointer;` +
            `min-width:${DONUT_MIN_HIT_AREA_PX}px;min-height:${DONUT_MIN_HIT_AREA_PX}px;border-radius:50%;`;
        renderInto(element, pointCount, properties);

        element.addEventListener('click', event => {
            event.stopPropagation();
            const source = map.getSource(SUBJECTS_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
            const pooled = pool.get(clusterId);
            if (!source || !pooled) return;
            source.getClusterExpansionZoom(clusterId, (error, zoom) => {
                if (error || zoom == null) return;
                if (zoom > options.clusterMaxZoom && options.onUnexpandable) {
                    source.getClusterLeaves(clusterId, Infinity, 0, (leavesError, leaves) => {
                        const lngLat = pooled.marker.getLngLat().toArray() as [number, number];
                        if (leavesError || !leaves) return;
                        const subjectIds = leaves
                            .map(leaf => leaf.properties?.id)
                            .filter((id): id is string => typeof id === 'string');
                        options.onUnexpandable?.(subjectIds, lngLat);
                    });
                    return;
                }
                map.easeTo({
                    center: pooled.marker.getLngLat(),
                    zoom: zoom + 0.2,
                    duration: options.reducedMotion ? 0 : 600,
                });
            });
        });

        if (!options.reducedMotion && typeof element.animate === 'function') {
            element.animate(
                [{ transform: 'scale(0.9)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }],
                { duration: 200, easing: 'ease-out' },
            );
        }
        return element;
    }

    const sync = () => {
        const source = map.getSource(SUBJECTS_SOURCE_ID);
        if (!source || !map.isSourceLoaded(SUBJECTS_SOURCE_ID)) return;

        const seen = new Set<number>();
        for (const feature of map.querySourceFeatures(SUBJECTS_SOURCE_ID)) {
            const properties = (feature.properties ?? {}) as Record<string, unknown>;
            if (!properties.cluster) continue;
            const clusterId = Number(properties.cluster_id);
            if (!Number.isFinite(clusterId) || seen.has(clusterId)) continue;
            seen.add(clusterId);

            const pointCount = Number(properties.point_count ?? 0);
            const geometry = feature.geometry;
            if (geometry.type !== 'Point') continue;
            const lngLat = geometry.coordinates as [number, number];
            const signature = clusterSignature(pointCount, properties);

            const pooled = pool.get(clusterId);
            if (pooled) {
                if (pooled.signature !== signature) {
                    renderInto(pooled.element, pointCount, properties);
                    pooled.signature = signature;
                }
                pooled.marker.setLngLat(lngLat);
            } else {
                const element = createElementFor(clusterId, pointCount, properties);
                const marker = new mapboxgl.Marker({ element }).setLngLat(lngLat).addTo(map);
                pool.set(clusterId, { marker, element, signature });
            }
        }

        for (const [clusterId, pooled] of pool) {
            if (!seen.has(clusterId)) {
                pooled.marker.remove();
                pool.delete(clusterId);
            }
        }
    };

    map.on('render', sync);

    return {
        setTopics(next: PinTopic[]) {
            topics = next;
            // Invalidate signatures so rings re-render with the new topic set.
            for (const pooled of pool.values()) pooled.signature = '';
        },
        destroy() {
            map.off('render', sync);
            for (const pooled of pool.values()) pooled.marker.remove();
            pool.clear();
        },
    };
}
