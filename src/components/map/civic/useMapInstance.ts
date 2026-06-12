import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { env } from '@/env.mjs';
import { MAP_STYLE_URL } from '@/lib/map/constants';

mapboxgl.accessToken = env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

export interface MapInstanceOptions {
    initialCenter: [number, number];
    initialZoom: number;
    maxZoom: number;
    interactive: boolean;
    cooperativeGestures: boolean;
    urlHash: boolean;
}

/**
 * Creates and owns a mapbox-gl instance for the lifetime of the component.
 * Options are read once at creation — the map is never re-created on prop
 * changes (callers pass data/camera updates through the layer modules).
 */
export function useMapInstance(
    containerRef: React.RefObject<HTMLDivElement | null>,
    options: MapInstanceOptions,
): { map: mapboxgl.Map | null; isLoaded: boolean } {
    const [map, setMap] = useState<mapboxgl.Map | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const initOptions = useRef(options);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const opts = initOptions.current;

        const instance = new mapboxgl.Map({
            container,
            style: MAP_STYLE_URL,
            center: opts.initialCenter,
            zoom: opts.initialZoom,
            maxZoom: opts.maxZoom,
            pitch: 0,
            bearing: 0,
            interactive: opts.interactive,
            cooperativeGestures: opts.cooperativeGestures,
            hash: opts.urlHash,
            attributionControl: false,
            dragRotate: false,
            pitchWithRotate: false,
            touchPitch: false,
        });
        instance.touchZoomRotate.disableRotation();
        instance.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');

        instance.on('load', () => setIsLoaded(true));
        if (process.env.NODE_ENV === 'development') {
            (window as unknown as { __civicMap?: mapboxgl.Map }).__civicMap = instance;
        }
        setMap(instance);

        const resizeObserver = new ResizeObserver(() => instance.resize());
        resizeObserver.observe(container);

        return () => {
            resizeObserver.disconnect();
            instance.remove();
            setMap(null);
            setIsLoaded(false);
        };
    }, [containerRef]);

    return { map, isLoaded };
}

/** Tracks the user's prefers-reduced-motion setting. */
export function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReduced(mediaQuery.matches);
        const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
        mediaQuery.addEventListener('change', onChange);
        return () => mediaQuery.removeEventListener('change', onChange);
    }, []);

    return reduced;
}
