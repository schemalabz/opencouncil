import mapboxgl from 'mapbox-gl';

let cachedResult: boolean | null = null;

/**
 * Check if the current browser/device supports WebGL (required by Mapbox GL JS).
 * The result is cached after the first call.
 */
export function isWebGLSupported(): boolean {
    if (cachedResult !== null) return cachedResult;

    try {
        cachedResult = mapboxgl.supported({ failIfMajorPerformanceCaveat: false });
    } catch {
        cachedResult = false;
    }

    return cachedResult;
}
