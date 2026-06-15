import type mapboxgl from 'mapbox-gl';
import { ensurePinImage, ensurePinImages, PIN_IMAGE_PREFIX, type PinTopic } from './pinImages';

interface IconLayerSchedulerOptions {
    /** The current topic set — read on each call, since subjects update changes it. */
    getTopics: () => PinTopic[];
    /** Add the image-dependent symbol layers (idempotent; guards on getLayer). */
    addIconLayers: () => void;
    /** Remove the image-dependent symbol layers. */
    removeIconLayers: () => void;
}

export interface IconLayerScheduler {
    /** (Re)add the icon layers once every pin image exists AND the map is idle. */
    whenReady: () => void;
    /** Debounced remove + re-add, e.g. after a late-arriving pin image. */
    scheduleRefresh: () => void;
    /** Stop all pending work and detach listeners. */
    dispose: () => void;
}

/**
 * Owns the "don't lay out a symbol layer before its addImage lands" dance for
 * the subject pin layers. Symbols laid out while their image is still
 * rasterizing are silently dropped and the tile never re-lays-out when the
 * image arrives; layers added while initial tiles are still parsing hit the
 * same fate. So icon layers are only (re)created once every pin image exists
 * AND the map is idle, and a missing image (e.g. after a style reload) triggers
 * a debounced rebuild. Every pending timer and one-shot listener is cleared on
 * dispose, so a fast attach → detach leaks nothing.
 */
export function createIconLayerScheduler(
    map: mapboxgl.Map,
    options: IconLayerSchedulerOptions,
): IconLayerScheduler {
    let disposed = false;
    let refreshScheduled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingIdle: (() => void) | null = null;

    const whenReady = () => {
        void ensurePinImages(map, options.getTopics()).then(() => {
            if (disposed || !map.getStyle()) return;
            if (map.loaded()) {
                options.addIconLayers();
            } else {
                const onIdle = () => {
                    pendingIdle = null;
                    if (!disposed && map.getStyle()) options.addIconLayers();
                };
                pendingIdle = onIdle;
                map.once('idle', onIdle);
            }
        });
    };

    const scheduleRefresh = () => {
        if (refreshScheduled) return;
        refreshScheduled = true;
        refreshTimer = setTimeout(() => {
            refreshScheduled = false;
            refreshTimer = null;
            if (disposed || !map.getStyle()) return;
            options.removeIconLayers();
            whenReady();
        }, 50);
    };

    // Pin images a style reload throws away get re-ensured here.
    const onStyleImageMissing = (event: { id: string }) => {
        if (!event.id.startsWith(PIN_IMAGE_PREFIX)) return;
        const topicId = event.id.slice(PIN_IMAGE_PREFIX.length);
        const topic = options.getTopics().find(t => t.id === topicId);
        void ensurePinImage(map, topic ?? { id: null, colorHex: '', icon: null }).then(scheduleRefresh);
    };
    map.on('styleimagemissing', onStyleImageMissing);

    return {
        whenReady,
        scheduleRefresh,
        dispose() {
            disposed = true;
            if (refreshTimer !== null) {
                clearTimeout(refreshTimer);
                refreshTimer = null;
            }
            if (pendingIdle) {
                map.off('idle', pendingIdle);
                pendingIdle = null;
            }
            map.off('styleimagemissing', onStyleImageMissing);
        },
    };
}
