import type mapboxgl from 'mapbox-gl';
import type { ExpressionSpecification, GeoJSONSourceSpecification } from 'mapbox-gl';
import { SELECTED_SOURCE_ID, SUBJECTS_SOURCE_ID } from '@/lib/map/constants';
import { buildClusterProperties } from '@/lib/map/donut';
import { anchorKeyOf } from '@/lib/map/spiderfy';
import type { MapSubject } from '@/lib/map/types';
import { ensurePinImage, ensurePinImages, pinImageId, PIN_IMAGE_PREFIX, type PinTopic } from './pinImages';

export const SUBJECTS_HALO_LAYER_ID = 'civic-subjects-halo';
export const SUBJECTS_DOTS_LAYER_ID = 'civic-subjects-dots';
export const SUBJECTS_PINS_LAYER_ID = 'civic-subjects-pins';
export const SUBJECTS_LABELS_LAYER_ID = 'civic-subjects-labels';
export const SUBJECTS_STACK_COUNT_LAYER_ID = 'civic-subjects-stack-count';
const SELECTED_OUTLINE_FILL_ID = 'civic-selected-outline-fill';
const SELECTED_OUTLINE_LINE_ID = 'civic-selected-outline-line';
const SELECTED_RING_LAYER_ID = 'civic-selected-ring';
const SELECTED_PIN_LAYER_ID = 'civic-selected-pin';

const INK = '#0c0a09';

// icon-size multipliers over the 32px logical badge
const PIN_SIZE_HOT = 1.0625;     // 34px
const PIN_SIZE_NORMAL = 0.8125;  // 26px
const PIN_SIZE_FLAT = 0.875;     // 28px when importance scaling is off
const SELECTED_SCALE = 1.15;

export interface SubjectsLayerOptions {
    clusterMode: 'donut' | 'none';
    clusterRadius: number;
    clusterMaxZoom: number;
    importanceScaling: boolean;
    interactive: boolean;
    onHover?: (subjectId: string | null) => void;
}

export interface SubjectsLayerHandle {
    /** Replace the rendered subjects; recreates the source when the topic signature changes. */
    update(subjects: MapSubject[]): void;
    /** Hover highlight driven from outside (panel rows). */
    setHovered(subjectId: string | null): void;
    /** Selection highlight + outline; renders even while the subject is clustered. */
    setSelected(subject: MapSubject | null): void;
    /** Hide the stacked pins at an anchor while the spiderfier fans them out. */
    setHiddenAnchorKey(anchorKey: string | null): void;
    /** Layer ids to hit-test for subject clicks, in priority order. */
    hitTestLayerIds(): string[];
    destroy(): void;
}

type AnchoredSubject = MapSubject & { anchor: [number, number] };

function hasRenderableAnchor(subject: MapSubject): subject is AnchoredSubject {
    if (!subject.anchor) return false;
    const [lng, lat] = subject.anchor;
    return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180;
}

export function topicsFromSubjects(subjects: MapSubject[]): PinTopic[] {
    const topics = new Map<string, PinTopic>();
    for (const subject of subjects) {
        if (subject.topicId && !topics.has(subject.topicId)) {
            topics.set(subject.topicId, { id: subject.topicId, colorHex: subject.topicColor, icon: subject.topicIcon });
        }
    }
    return [...topics.values()].sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''));
}

function topicSignature(topics: PinTopic[]): string {
    return topics.map(topic => topic.id).join(',');
}

function toFeatureCollection(subjects: MapSubject[]): GeoJSON.FeatureCollection {
    const renderable = subjects.filter(hasRenderableAnchor);
    // Same-spot groups: every feature knows its stack size, one per stack
    // (the leader) carries the count badge.
    const stackCounts = new Map<string, number>();
    for (const subject of renderable) {
        const key = anchorKeyOf(subject.anchor);
        stackCounts.set(key, (stackCounts.get(key) ?? 0) + 1);
    }
    const seenStacks = new Set<string>();
    return {
        type: 'FeatureCollection',
        features: renderable.map(subject => {
            const anchorKey = anchorKeyOf(subject.anchor);
            const stackLeader = !seenStacks.has(anchorKey);
            seenStacks.add(anchorKey);
            return {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: subject.anchor },
                properties: {
                    id: subject.id,
                    name: subject.name,
                    topicId: subject.topicId,
                    topicColor: subject.topicColor,
                    importance: subject.importance,
                    sortKey: -subject.discussionTimeSeconds,
                    anchorKey,
                    stackCount: stackCounts.get(anchorKey) ?? 1,
                    stackLeader,
                },
            };
        }),
    };
}

function selectionFeatureCollection(subject: MapSubject | null): GeoJSON.FeatureCollection {
    if (!subject || !hasRenderableAnchor(subject)) {
        return { type: 'FeatureCollection', features: [] };
    }
    const features: GeoJSON.Feature[] = [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: subject.anchor },
        properties: {
            id: subject.id,
            topicId: subject.topicId,
            topicColor: subject.topicColor,
            importance: subject.importance,
        },
    }];
    if (subject.geometry && subject.geometry.type !== 'Point') {
        features.push({
            type: 'Feature',
            geometry: subject.geometry,
            properties: { id: subject.id, topicColor: subject.topicColor, outline: true },
        });
    }
    return { type: 'FeatureCollection', features };
}

const hoverExpression: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false];
const notClustered: ExpressionSpecification = ['!', ['has', 'point_count']];

export function attachSubjectsLayer(
    map: mapboxgl.Map,
    subjects: MapSubject[],
    options: SubjectsLayerOptions,
): SubjectsLayerHandle {
    let topics = topicsFromSubjects(subjects);
    let signature = topicSignature(topics);
    let hoveredId: string | null = null;
    let hiddenAnchorKey: string | null = null;

    // Base layer filters, composable with the spiderfier's hidden anchor
    const haloFilter = notClustered;
    const dotsFilter: ExpressionSpecification = options.importanceScaling
        ? ['all', notClustered, ['==', ['get', 'importance'], 'minor']]
        : ['boolean', false];
    const pinsFilter: ExpressionSpecification = options.importanceScaling
        ? ['all', notClustered, ['!=', ['get', 'importance'], 'minor']]
        : notClustered;
    const labelsFilter: ExpressionSpecification = ['all', notClustered, ['==', ['get', 'importance'], 'hot']];
    const stackCountFilter: ExpressionSpecification = [
        'all', notClustered,
        ['boolean', ['get', 'stackLeader'], false],
        ['>', ['get', 'stackCount'], 1],
    ];

    const withHidden = (base: ExpressionSpecification): ExpressionSpecification =>
        hiddenAnchorKey === null
            ? base
            : ['all', base, ['!=', ['get', 'anchorKey'], hiddenAnchorKey]];

    let disposed = false;

    // Symbols laid out while their image is still rasterizing are dropped and
    // the tile never re-lays-out when the image lands later; layers added
    // while initial tiles are still parsing hit the same fate. So the icon
    // layers (pins, selected pin) are only (re)created once every pin image
    // exists AND the map is idle.
    const addIconLayersWhenReady = () => {
        void ensurePinImages(map, topics).then(() => {
            if (disposed || !map.getStyle()) return;
            if (map.loaded()) {
                addIconLayers();
            } else {
                map.once('idle', () => {
                    if (!disposed && map.getStyle()) addIconLayers();
                });
            }
        });
    };
    let refreshScheduled = false;
    const scheduleIconLayerRefresh = () => {
        if (refreshScheduled) return;
        refreshScheduled = true;
        setTimeout(() => {
            refreshScheduled = false;
            if (disposed || !map.getStyle()) return;
            removeIconLayers();
            addIconLayersWhenReady();
        }, 50);
    };

    // Pin images a style reload throws away get re-ensured here.
    const onStyleImageMissing = (event: { id: string }) => {
        if (!event.id.startsWith(PIN_IMAGE_PREFIX)) return;
        const topicId = event.id.slice(PIN_IMAGE_PREFIX.length);
        const topic = topics.find(t => t.id === topicId);
        void ensurePinImage(map, topic ?? { id: null, colorHex: '', icon: null }).then(scheduleIconLayerRefresh);
    };
    map.on('styleimagemissing', onStyleImageMissing);

    function addSourceAndLayers(data: GeoJSON.FeatureCollection) {
        const sourceSpec: GeoJSONSourceSpecification = {
            type: 'geojson',
            data,
            promoteId: 'id',
        };
        if (options.clusterMode === 'donut') {
            sourceSpec.cluster = true;
            sourceSpec.clusterRadius = options.clusterRadius;
            sourceSpec.clusterMaxZoom = options.clusterMaxZoom;
            sourceSpec.clusterProperties = buildClusterProperties(
                topics.map(topic => topic.id).filter((id): id is string => id !== null),
            ) as never;
        }
        map.addSource(SUBJECTS_SOURCE_ID, sourceSpec);

        // Hover glow, under everything subject-related
        map.addLayer({
            id: SUBJECTS_HALO_LAYER_ID,
            type: 'circle',
            source: SUBJECTS_SOURCE_ID,
            filter: withHidden(haloFilter),
            paint: {
                'circle-color': ['get', 'topicColor'],
                'circle-radius': [
                    'match', ['get', 'importance'],
                    'hot', 26,
                    'normal', 20,
                    12,
                ],
                'circle-opacity': ['case', hoverExpression, 0.18, 0],
                'circle-opacity-transition': { duration: 150 },
            },
        });

        // Minor (τυπικά) subjects: small dots until you zoom close
        map.addLayer({
            id: SUBJECTS_DOTS_LAYER_ID,
            type: 'circle',
            source: SUBJECTS_SOURCE_ID,
            filter: withHidden(dotsFilter),
            paint: {
                'circle-color': ['get', 'topicColor'],
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 16, 5],
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 1.5,
                'circle-opacity': 0.85,
            },
        });

        // Hot subjects get their names once streets are readable
        map.addLayer({
            id: SUBJECTS_LABELS_LAYER_ID,
            type: 'symbol',
            source: SUBJECTS_SOURCE_ID,
            minzoom: 15,
            filter: withHidden(labelsFilter),
            layout: {
                'text-field': ['get', 'name'],
                'text-size': 12,
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-offset': [0, 1.6],
                'text-anchor': 'top',
                'text-max-width': 14,
                'text-optional': true,
            },
            paint: {
                'text-color': '#1c1917',
                'text-halo-color': '#ffffff',
                'text-halo-width': 1.5,
            },
        });

        // How many subjects hide behind a stacked pin — a small floating
        // count at its top right (the spiderfier hides it while fanned out).
        map.addLayer({
            id: SUBJECTS_STACK_COUNT_LAYER_ID,
            type: 'symbol',
            source: SUBJECTS_SOURCE_ID,
            filter: withHidden(stackCountFilter),
            layout: {
                'text-field': ['to-string', ['get', 'stackCount']],
                'text-size': 11,
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-anchor': 'bottom-left',
                'text-offset': [0.7, -0.7],
                'text-allow-overlap': true,
                'text-ignore-placement': true,
            },
            paint: {
                'text-color': '#0c0a09',
                'text-halo-color': '#ffffff',
                'text-halo-width': 1.8,
            },
        });
    }

    function addSelectionLayers() {
        map.addSource(SELECTED_SOURCE_ID, {
            type: 'geojson',
            data: selectionFeatureCollection(null),
        });
        // True geometry of a selected line/polygon subject
        map.addLayer({
            id: SELECTED_OUTLINE_FILL_ID,
            type: 'fill',
            source: SELECTED_SOURCE_ID,
            filter: ['==', ['geometry-type'], 'Polygon'],
            paint: { 'fill-color': ['get', 'topicColor'], 'fill-opacity': 0.16 },
        }, SUBJECTS_HALO_LAYER_ID);
        map.addLayer({
            id: SELECTED_OUTLINE_LINE_ID,
            type: 'line',
            source: SELECTED_SOURCE_ID,
            filter: ['!=', ['geometry-type'], 'Point'],
            paint: { 'line-color': ['get', 'topicColor'], 'line-width': 2 },
        }, SUBJECTS_HALO_LAYER_ID);
        // Selection ring (the system focus-ring vocabulary, on the map)
        map.addLayer({
            id: SELECTED_RING_LAYER_ID,
            type: 'circle',
            source: SELECTED_SOURCE_ID,
            filter: ['==', ['geometry-type'], 'Point'],
            paint: {
                'circle-radius': [
                    'match', ['get', 'importance'],
                    'hot', 25,
                    'normal', 20,
                    14,
                ],
                'circle-color': 'transparent',
                'circle-stroke-color': INK,
                'circle-stroke-width': 2,
                'circle-pitch-alignment': 'map',
            },
        });
    }

    /** Image-dependent symbol layers — only added once pin images exist. */
    function addIconLayers() {
        if (!map.getSource(SUBJECTS_SOURCE_ID)) return;
        if (!map.getLayer(SUBJECTS_PINS_LAYER_ID)) {
            // Icon pins for discussed subjects, kept below the selection layers
            const beforeId = map.getLayer(SELECTED_RING_LAYER_ID) ? SELECTED_RING_LAYER_ID : undefined;
            map.addLayer({
                id: SUBJECTS_PINS_LAYER_ID,
                type: 'symbol',
                source: SUBJECTS_SOURCE_ID,
                filter: withHidden(pinsFilter),
                layout: {
                    'icon-image': ['concat', PIN_IMAGE_PREFIX, ['coalesce', ['get', 'topicId'], 'fallback']],
                    'icon-size': options.importanceScaling
                        ? ['match', ['get', 'importance'], 'hot', PIN_SIZE_HOT, PIN_SIZE_NORMAL]
                        : PIN_SIZE_FLAT,
                    // Pins are the content — they never enter collision battles
                    // (the placement engine silently drops losers).
                    'icon-allow-overlap': true,
                    'icon-ignore-placement': true,
                    'symbol-sort-key': ['get', 'sortKey'],
                },
            }, beforeId);
        }
        if (map.getSource(SELECTED_SOURCE_ID) && !map.getLayer(SELECTED_PIN_LAYER_ID)) {
            // Enlarged pin on top of the selection ring
            map.addLayer({
                id: SELECTED_PIN_LAYER_ID,
                type: 'symbol',
                source: SELECTED_SOURCE_ID,
                filter: ['==', ['geometry-type'], 'Point'],
                layout: {
                    'icon-image': ['concat', PIN_IMAGE_PREFIX, ['coalesce', ['get', 'topicId'], 'fallback']],
                    'icon-size': options.importanceScaling
                        ? ['match', ['get', 'importance'], 'hot', PIN_SIZE_HOT * SELECTED_SCALE, PIN_SIZE_NORMAL * SELECTED_SCALE]
                        : PIN_SIZE_FLAT * SELECTED_SCALE,
                    'icon-allow-overlap': true,
                    'icon-ignore-placement': true,
                },
            });
        }
    }

    function removeIconLayers() {
        for (const layerId of [SELECTED_PIN_LAYER_ID, SUBJECTS_PINS_LAYER_ID]) {
            if (map.getLayer(layerId)) map.removeLayer(layerId);
        }
    }

    addSourceAndLayers(toFeatureCollection(subjects));
    addSelectionLayers();
    addIconLayersWhenReady();

    const setHoverState = (subjectId: string | null) => {
        if (subjectId === hoveredId) return;
        if (hoveredId !== null) {
            map.setFeatureState({ source: SUBJECTS_SOURCE_ID, id: hoveredId }, { hover: false });
        }
        if (subjectId !== null) {
            map.setFeatureState({ source: SUBJECTS_SOURCE_ID, id: subjectId }, { hover: true });
        }
        hoveredId = subjectId;
    };

    const onMouseMove = (event: mapboxgl.MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const id = feature?.id != null ? String(feature.id) : null;
        if (id !== hoveredId) {
            setHoverState(id);
            map.getCanvas().style.cursor = id !== null ? 'pointer' : '';
            options.onHover?.(id);
        }
    };
    const onMouseLeave = () => {
        if (hoveredId !== null) {
            setHoverState(null);
            map.getCanvas().style.cursor = '';
            options.onHover?.(null);
        }
    };

    if (options.interactive) {
        for (const layerId of [SUBJECTS_PINS_LAYER_ID, SUBJECTS_DOTS_LAYER_ID]) {
            map.on('mousemove', layerId, onMouseMove);
            map.on('mouseleave', layerId, onMouseLeave);
        }
    }

    function removeSubjectLayersAndSource() {
        for (const layerId of [SUBJECTS_STACK_COUNT_LAYER_ID, SUBJECTS_LABELS_LAYER_ID, SUBJECTS_PINS_LAYER_ID, SUBJECTS_DOTS_LAYER_ID, SUBJECTS_HALO_LAYER_ID]) {
            if (map.getLayer(layerId)) map.removeLayer(layerId);
        }
        if (map.getSource(SUBJECTS_SOURCE_ID)) map.removeSource(SUBJECTS_SOURCE_ID);
    }

    return {
        update(next: MapSubject[]) {
            const nextTopics = topicsFromSubjects(next);
            const nextSignature = topicSignature(nextTopics);
            const needsRebuild = options.clusterMode === 'donut' && nextSignature !== signature;
            topics = nextTopics;
            signature = nextSignature;

            if (needsRebuild) {
                // clusterProperties are fixed at source creation — recreate.
                setHoverState(null);
                removeIconLayers();
                removeSubjectLayersAndSource();
                addSourceAndLayers(toFeatureCollection(next));
                addIconLayersWhenReady();
                return;
            }
            // Same topic set is the common case — only rebuild icon layers
            // when a new topic's image still has to rasterize.
            if (topics.some(topic => !map.hasImage(pinImageId(topic.id)))) {
                void ensurePinImages(map, topics).then(scheduleIconLayerRefresh);
            }
            const source = map.getSource(SUBJECTS_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
            source?.setData(toFeatureCollection(next));
        },
        setHovered(subjectId: string | null) {
            setHoverState(subjectId);
        },
        setSelected(subject: MapSubject | null) {
            if (subject?.topicId && !map.hasImage(pinImageId(subject.topicId))) {
                void ensurePinImage(map, { id: subject.topicId, colorHex: subject.topicColor, icon: subject.topicIcon })
                    .then(scheduleIconLayerRefresh);
            }
            const source = map.getSource(SELECTED_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
            source?.setData(selectionFeatureCollection(subject));
        },
        setHiddenAnchorKey(anchorKey: string | null) {
            if (anchorKey === hiddenAnchorKey) return;
            hiddenAnchorKey = anchorKey;
            const filtersByLayer: [string, ExpressionSpecification][] = [
                [SUBJECTS_HALO_LAYER_ID, haloFilter],
                [SUBJECTS_DOTS_LAYER_ID, dotsFilter],
                [SUBJECTS_PINS_LAYER_ID, pinsFilter],
                [SUBJECTS_LABELS_LAYER_ID, labelsFilter],
                [SUBJECTS_STACK_COUNT_LAYER_ID, stackCountFilter],
            ];
            for (const [layerId, base] of filtersByLayer) {
                if (map.getLayer(layerId)) map.setFilter(layerId, withHidden(base));
            }
        },
        hitTestLayerIds() {
            return [SELECTED_PIN_LAYER_ID, SUBJECTS_PINS_LAYER_ID, SUBJECTS_DOTS_LAYER_ID].filter(id => map.getLayer(id));
        },
        destroy() {
            disposed = true;
            if (options.interactive) {
                for (const layerId of [SUBJECTS_PINS_LAYER_ID, SUBJECTS_DOTS_LAYER_ID]) {
                    map.off('mousemove', layerId, onMouseMove);
                    map.off('mouseleave', layerId, onMouseLeave);
                }
            }
            map.off('styleimagemissing', onStyleImageMissing);
            if (!map.getStyle()) return;
            for (const layerId of [SELECTED_PIN_LAYER_ID, SELECTED_RING_LAYER_ID, SELECTED_OUTLINE_LINE_ID, SELECTED_OUTLINE_FILL_ID]) {
                if (map.getLayer(layerId)) map.removeLayer(layerId);
            }
            if (map.getSource(SELECTED_SOURCE_ID)) map.removeSource(SELECTED_SOURCE_ID);
            removeSubjectLayersAndSource();
        },
    };
}
