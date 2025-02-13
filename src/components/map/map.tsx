"use client"
import { useRef, useEffect, useCallback, useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { cn } from '@/lib/utils'
import { createRoot } from 'react-dom/client'

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

const guessCenterFromFeatures = (features: MapFeature[]): [number, number] | undefined => {
    if (features.length === 0) return undefined;
    console.log("Centering on feature");
    const feature = features[0];
    if (!feature.geometry) return undefined;
    if (feature.geometry.type === 'Point') {
        console.log("Centering on point");
        return [feature.geometry.coordinates[0], feature.geometry.coordinates[1]];
    } else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
        console.log("Centering on polygon");
        // For polygons, find the center by averaging all coordinates
        const coords = feature.geometry.type === 'Polygon' ?
            feature.geometry.coordinates[0] :
            feature.geometry.coordinates[0][0];

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        coords.forEach((coord: [number, number]) => {
            minX = Math.min(minX, coord[0]);
            maxX = Math.max(maxX, coord[0]);
            minY = Math.min(minY, coord[1]);
            maxY = Math.max(maxY, coord[1]);
        });

        return [(minX + maxX) / 2, (minY + maxY) / 2];
    }
    return undefined;
}

export default function Map({
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

    // Memoize the center coordinates
    const centerCoords = useMemo(() => {
        if (center) return center;
        const guessedCenter = guessCenterFromFeatures(features);
        return guessedCenter || [23.7275, 37.9838] as [number, number];
    }, [center, features]);

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

        mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN!;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/christosporios/cm4icyrf700f201qw75bv27fa',
            center: centerCoords,
            zoom,
            pitch,
            attributionControl: false,
        });

        const resizeObserver = new ResizeObserver(() => {
            map.current?.resize();
        });

        resizeObserver.observe(mapContainer.current);

        map.current.on('load', () => {
            if (animateRotation) {
                animationFrame.current = requestAnimationFrame(rotateCamera);
            }
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
        };
    }, []); // Empty dependency array - only run once

    // Handle feature updates
    useEffect(() => {
        if (!map.current || !map.current.loaded()) return;

        // Update source data if it exists
        if (map.current.getSource('features')) {
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
        } else {
            // Initial setup of source and layers
            map.current.addSource('features', {
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

            // Add layers only once
            map.current.addLayer({
                'id': 'feature-fills',
                'type': 'fill',
                'source': 'features',
                'paint': {
                    'fill-color': ['get', 'fillColor'],
                    'fill-opacity': ['get', 'fillOpacity']
                }
            });

            map.current.addLayer({
                'id': 'feature-borders',
                'type': 'line',
                'source': 'features',
                'paint': {
                    'line-color': ['get', 'strokeColor'],
                    'line-width': ['get', 'strokeWidth']
                }
            });

            map.current.addLayer({
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

            map.current.addLayer({
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
                map.current.on('click', 'feature-fills', handleMapFeatureClick);
                map.current.on('click', 'feature-points', handleMapFeatureClick);
            }

            map.current.on('mousemove', 'feature-fills', handleFeatureHover);
            map.current.on('mouseleave', 'feature-fills', handleFeatureLeave);
            map.current.on('mousemove', 'feature-points', handleFeatureHover);
            map.current.on('mouseleave', 'feature-points', handleFeatureLeave);
        }
    }, [features, handleFeatureHover, handleFeatureLeave, handleMapFeatureClick]);

    // Update map position when center/zoom changes
    useEffect(() => {
        if (!map.current || !map.current.loaded()) return;
        map.current.setCenter(centerCoords);
        map.current.setZoom(zoom);
    }, [centerCoords, zoom]);

    return (
        <div ref={mapContainer} className={cn("w-full h-full", className)} />
    );
}
