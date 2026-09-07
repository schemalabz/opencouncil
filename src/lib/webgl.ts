import mapboxgl from 'mapbox-gl';

let cachedResult: boolean | null = null;

/**
 * Check if the current browser/device supports WebGL (required by Mapbox GL JS).
 * The result is cached after the first call.
 */
export function isWebGLSupported(): boolean {
    if (cachedResult !== null) return cachedResult;

    try {
        // mapbox-gl 3.29 changed this from an options object to a positional
        // boolean. Passing an object here is truthy, which would mean
        // failIfMajorPerformanceCaveat: true and hide the map from anyone on a
        // software renderer.
        cachedResult = mapboxgl.supported(false);
    } catch {
        cachedResult = false;
    }

    return cachedResult;
}
