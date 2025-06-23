"use client"
import { useRef, useEffect, useCallback, useMemo, memo } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { cn, calculateGeometryBounds } from '@/lib/utils'
import { createRoot } from 'react-dom/client'
import { env } from '@/env.mjs'

mapboxgl.accessToken = env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

export interface MapFeature {
    id: string
    geometry: any // GeoJSON geometry
    properties?: Record<string, any>
    style?: {
        fillColor?: string
        fillOpacity?: number
        strokeColor?: string
        strokeWidth?: number
        label?: string
    }
}

interface MapProps {
    className?: string
    center?: [number, number] // Longitude, latitude coordinates
    zoom?: number
    animateRotation?: boolean
    pitch?: number
    features?: MapFeature[]
    onFeatureClick?: (feature: GeoJSON.Feature) => void
    renderPopup?: (feature: GeoJSON.Feature) => React.ReactNode
}

const ANIMATE_ROTATION_SPEED = 1000;

const guessCenterFromFeatures = (features: MapFeature[]): [number, number] => {
    if (features.length === 0) {
        return calculateGeometryBounds(null).center;
    }
    return calculateGeometryBounds(features[0].geometry).center;
}

const Map = memo(function Map({
    className,
    center = undefined,
    zoom = 10,
    animateRotation = true,
    pitch = 45,
    features = [],
    onFeatureClick,
    renderPopup
}: MapProps) {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<mapboxgl.Map | null>(null)
    const popup = useRef<mapboxgl.Popup | null>(null)
    const popupRoot = useRef<ReturnType<typeof createRoot> | null>(null)
    const animationFrame = useRef<number | null>(null)
    const featuresRef = useRef(features)
    const isInitialized = useRef(false)

    // Store user-controlled states in refs to preserve them during rerenders
    const currentZoom = useRef(zoom)
    const currentCenter = useRef<[number, number] | undefined>(undefined)
    const isUserInteracted = useRef(false)

    // Memoize the center coordinates only for initial setup
    const initialCenterCoords = useMemo(() => {
        if (center) return center;
        return guessCenterFromFeatures(features);
    }, []); // Empty dependency array - only calculate once

    const rotateCamera = useCallback((timestamp: number) => {
        if (!map.current) return
        map.current.rotateTo((timestamp / ANIMATE_ROTATION_SPEED) % 360, { duration: 0 })
        animationFrame.current = requestAnimationFrame(rotateCamera)
    }, [])

    // Memoize event handlers
    const handleFeatureHover = useCallback((e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
        if (!map.current || !e.features || e.features.length === 0) return;

        const feature = e.features[0];
        if (!feature.properties) return;

        map.current.getCanvas().style.cursor = 'pointer';
        const baseOpacity = feature.properties.fillOpacity || 0.4;

        if (feature.geometry.type === 'Point') {
            map.current.setPaintProperty('feature-points', 'circle-opacity', [
                'case',
                ['==', ['get', 'id'], feature.properties.id],
                Math.min(baseOpacity + 0.3, 1),
                ['get', 'fillOpacity']
            ]);
        } else {
            map.current.setPaintProperty('feature-fills', 'fill-opacity', [
                'case',
                ['==', ['get', 'id'], feature.properties.id],
                Math.min(baseOpacity + 0.3, 1),
                ['get', 'fillOpacity']
            ]);
        }

        if (renderPopup && feature.properties?.subjectId) {
            const coordinates = e.lngLat;

            if (!popup.current) {
                popup.current = new mapboxgl.Popup({
                    closeButton: false,
                    closeOnClick: false,
                    maxWidth: '400px',
                    className: 'subject-popup',
                    offset: [0, -15]
                });
            }

            const popupContent = renderPopup(feature);
            const container = document.createElement('div');

            if (popupRoot.current) {
                popupRoot.current.unmount();
            }

            popupRoot.current = createRoot(container);
            popupRoot.current.render(popupContent);

            popup.current
                .setLngLat(coordinates)
                .setDOMContent(container)
                .addTo(map.current);
        }
    }, [renderPopup]);

    const handleFeatureLeave = useCallback(() => {
        if (!map.current) return;
        map.current.getCanvas().style.cursor = '';
        map.current.setPaintProperty('feature-fills', 'fill-opacity', ['get', 'fillOpacity']);
        map.current.setPaintProperty('feature-points', 'circle-opacity', ['get', 'fillOpacity']);

        if (popupRoot.current) {
            popupRoot.current.unmount();
            popupRoot.current = null;
        }
        if (popup.current) {
            popup.current.remove();
        }
    }, []);

    const handleMapFeatureClick = useCallback((e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
        if (e.features && e.features.length > 0 && onFeatureClick) {
            onFeatureClick(e.features[0]);
        }
    }, [onFeatureClick]);

    // Initialize map only once
    useEffect(() => {
        if (!mapContainer.current || map.current) return;

        const centerToUse = currentCenter.current || initialCenterCoords;
        const zoomToUse = currentZoom.current;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/christosporios/cm4icyrf700f201qw75bv27fa',
            center: centerToUse,
            zoom: zoomToUse,
            pitch,
            attributionControl: false,
        });

        // Track user interactions to prevent auto-centering
        map.current.on('dragend', () => {
            isUserInteracted.current = true;
            if (map.current) {
                currentCenter.current = [map.current.getCenter().lng, map.current.getCenter().lat];
            }
        });

        map.current.on('zoomend', () => {
            isUserInteracted.current = true;
            if (map.current) {
                currentZoom.current = map.current.getZoom();
            }
        });

        const resizeObserver = new ResizeObserver(() => {
            map.current?.resize();
        });

        resizeObserver.observe(mapContainer.current);

        // Wait for map to load before initializing features
        map.current.on('load', () => {
            isInitialized.current = true;

            if (animateRotation) {
                animationFrame.current = requestAnimationFrame(rotateCamera);
            }

            // Initialize source and layers
            map.current?.addSource('features', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: features.map(feature => ({
                        type: 'Feature',
                        geometry: feature.geometry,
                        properties: {
                            id: feature.id,
                            subjectId: feature.id,
                            ...feature.properties,
                            fillColor: feature.style?.fillColor || '#627BBC',
                            fillOpacity: feature.style?.fillOpacity || 0.4,
                            strokeColor: feature.style?.strokeColor || '#627BBC',
                            strokeWidth: feature.style?.strokeWidth || 2,
                            label: feature.style?.label || ''
                        }
                    }))
                }
            });

            // Add layers
            map.current?.addLayer({
                'id': 'feature-fills',
                'type': 'fill',
                'source': 'features',
                'paint': {
                    'fill-color': ['get', 'fillColor'],
                    'fill-opacity': ['get', 'fillOpacity']
                }
            });

            map.current?.addLayer({
                'id': 'feature-borders',
                'type': 'line',
                'source': 'features',
                'paint': {
                    'line-color': ['get', 'strokeColor'],
                    'line-width': ['get', 'strokeWidth']
                }
            });

            map.current?.addLayer({
                'id': 'feature-labels',
                'type': 'symbol',
                'source': 'features',
                'layout': {
                    'text-field': ['get', 'label'],
                    'text-size': 12,
                    'text-anchor': 'left',
                    'text-offset': [1, 0],
                    'text-padding': 5,
                    'text-optional': true,
                    'text-max-width': 24
                },
                'paint': {
                    'text-color': '#000000',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 2
                }
            });

            map.current?.addLayer({
                'id': 'feature-points',
                'type': 'circle',
                'source': 'features',
                'filter': ['==', ['geometry-type'], 'Point'],
                'paint': {
                    'circle-color': ['get', 'fillColor'],
                    'circle-opacity': ['get', 'fillOpacity'],
                    'circle-radius': ['get', 'strokeWidth'],
                    'circle-stroke-width': 2,
                    'circle-stroke-color': ['get', 'strokeColor']
                }
            });

            // Add event listeners
            if (onFeatureClick) {
                map.current?.on('click', 'feature-fills', handleMapFeatureClick);
                map.current?.on('click', 'feature-points', handleMapFeatureClick);
            }

            map.current?.on('mousemove', 'feature-fills', handleFeatureHover);
            map.current?.on('mouseleave', 'feature-fills', handleFeatureLeave);
            map.current?.on('mousemove', 'feature-points', handleFeatureHover);
            map.current?.on('mouseleave', 'feature-points', handleFeatureLeave);
        });

        return () => {
            if (animationFrame.current) {
                cancelAnimationFrame(animationFrame.current);
            }
            if (popupRoot.current) {
                popupRoot.current.unmount();
            }
            if (popup.current) {
                popup.current.remove();
            }
            resizeObserver.disconnect();
            map.current?.remove();
            map.current = null;
            isInitialized.current = false;
        };
    }, []); // Empty dependency array - initialize only once

    // Handle feature updates without resetting zoom/center
    useEffect(() => {
        if (!map.current || !isInitialized.current || !map.current.getSource('features')) return;

        console.log('Updating map features:', features);

        // Additional debug for point features
        features.forEach(feature => {
            if (feature.geometry?.type === 'Point') {
                console.log('Point geometry details:', {
                    id: feature.id,
                    coordinates: feature.geometry.coordinates,
                    valid: Array.isArray(feature.geometry.coordinates) &&
                        feature.geometry.coordinates.length === 2 &&
                        typeof feature.geometry.coordinates[0] === 'number' &&
                        typeof feature.geometry.coordinates[1] === 'number'
                });
            }
        });

        // Update source data without changing zoom/center
        (map.current.getSource('features') as mapboxgl.GeoJSONSource).setData({
            type: 'FeatureCollection',
            features: features.map(feature => ({
                type: 'Feature',
                geometry: feature.geometry,
                properties: {
                    id: feature.id,
                    subjectId: feature.id,
                    ...feature.properties,
                    fillColor: feature.style?.fillColor || '#627BBC',
                    fillOpacity: feature.style?.fillOpacity || 0.4,
                    strokeColor: feature.style?.strokeColor || '#627BBC',
                    strokeWidth: feature.style?.strokeWidth || 2,
                    label: feature.style?.label || ''
                }
            }))
        });
    }, [features]);

    // Only update center/zoom if explicitly changed via props AND user hasn't interacted
    useEffect(() => {
        if (!map.current || !isInitialized.current || isUserInteracted.current) return;

        // If center prop changes explicitly, update it
        if (center && (currentCenter.current?.[0] !== center[0] || currentCenter.current?.[1] !== center[1])) {
            map.current.setCenter(center);
            currentCenter.current = center;
        }
    }, [center]);

    useEffect(() => {
        if (!map.current || !isInitialized.current || isUserInteracted.current) return;

        // If zoom prop changes explicitly, update it
        if (zoom !== currentZoom.current) {
            map.current.setZoom(zoom);
            currentZoom.current = zoom;
        }
    }, [zoom]);

    return (
        <div ref={mapContainer} className={cn("w-full h-full", className)} />
    );
}, (prevProps, nextProps) => {
    // Custom comparison to prevent unnecessary rerenders
    // Only rerender if specific props change
    return (
        prevProps.center === nextProps.center &&
        prevProps.zoom === nextProps.zoom &&
        prevProps.animateRotation === nextProps.animateRotation &&
        prevProps.pitch === nextProps.pitch &&
        JSON.stringify(prevProps.features) === JSON.stringify(nextProps.features)
    );
})

export default Map;
