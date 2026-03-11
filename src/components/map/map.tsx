"use client"
import { useRef, useEffect, useCallback, useMemo, memo, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import 'mapbox-gl/dist/mapbox-gl.css'
import { cn, calculateGeometryBounds } from '@/lib/utils'
import { createRoot } from 'react-dom/client'
import { env } from '@/env.mjs'

mapboxgl.accessToken = env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

/**
 * Application-level map feature extending GeoJSON.Feature
 *
 * Note: The index signature `[key: string]: unknown` is required because:
 * 1. Mapbox GL dynamically adds internal properties to features
 * 2. We spread `...feature.properties` into Mapbox layers (line 556, 747)
 * 3. Using `unknown` instead of `any` maintains type safety for known properties
 */
export interface MapFeature extends GeoJSON.Feature {
    type: 'Feature'
    id: string
    geometry: GeoJSON.Geometry
    properties: {
        featureType?: 'city' | 'subject'
        name?: string
        name_en?: string
        cityId?: string
        cityName?: string
        subjectId?: string
        officialSupport?: boolean
        supportsNotifications?: boolean
        logoImage?: string | null
        meetingsCount?: number
        petitionCount?: number
        locationText?: string
        topicName?: string
        topicColor?: string
        topicIcon?: string | null
        meetingDate?: string
        meetingName?: string
        discussionTimeSeconds?: number
        speakerCount?: number
        description?: string
        councilMeetingId?: string
        uniqueFeatureId?: string
        // Allow Mapbox internal properties while preserving type safety for known fields
        [key: string]: unknown
    }
    style?: {
        fillColor?: string
        fillOpacity?: number
        strokeColor?: string
        strokeWidth?: number
        strokeOpacity?: number
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
    editingMode?: boolean
    drawingMode?: 'point' | 'polygon'
    selectedGeometryForEdit?: string | null
    zoomToGeometry?: GeoJSON.Geometry | null
    activeTourFeature?: GeoJSON.Feature | null
    travelerGeoJSON?: GeoJSON.FeatureCollection | null
    onTourPause?: (paused: boolean) => void
}

const ANIMATE_ROTATION_SPEED = 1000;

const guessCenterFromFeatures = (features: MapFeature[]): [number, number] => {
    if (features.length === 0) {
        return calculateGeometryBounds(null).center;
    }
    return calculateGeometryBounds(features[0].geometry).center;
}

const MapComponent = memo(function MapComponent({
    className,
    center = undefined,
    zoom = 10,
    animateRotation = true,
    pitch = 45,
    features = [],
    onFeatureClick,
    renderPopup,
    editingMode = false,
    drawingMode = 'point',
    selectedGeometryForEdit = null,
    zoomToGeometry,
    activeTourFeature,
    travelerGeoJSON,
    onTourPause
}: MapProps) {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<mapboxgl.Map | null>(null)
    const popup = useRef<mapboxgl.Popup | null>(null)
    const tourPopup = useRef<mapboxgl.Popup | null>(null)
    const tourPopupRoot = useRef<ReturnType<typeof createRoot> | null>(null)
    const popupRoot = useRef<ReturnType<typeof createRoot> | null>(null)
    const animationFrame = useRef<number | null>(null)
    const [isInitialized, setIsInitialized] = useState(false)
    const draw = useRef<MapboxDraw | null>(null)
    const hoverTimeout = useRef<NodeJS.Timeout | null>(null)
    const currentHoveredFeature = useRef<string | null>(null)

    // Store user-controlled states in refs to preserve them during rerenders
    const isUserInteracted = useRef(false)
    const currentCenter = useRef<[number, number] | null>(null)
    const currentZoom = useRef(zoom)
    const selectedGeometryRef = useRef<string | null>(selectedGeometryForEdit)

    // Handle Shooting Star Update (Declarative)
    useEffect(() => {
        if (!map.current || !isInitialized || !travelerGeoJSON) return;
        
        const tryUpdate = () => {
            const source = map.current?.getSource('tour-traveler') as mapboxgl.GeoJSONSource;
            if (source) {
                source.setData(travelerGeoJSON);
            }
        };

        if (map.current.isStyleLoaded()) {
            tryUpdate();
        } else {
            map.current.once('idle', tryUpdate);
        }
    }, [travelerGeoJSON, isInitialized]);

    // Handle Auto-Tour Popup
    useEffect(() => {
        if (!map.current || !isInitialized || !renderPopup) return;

        // Clean up tour popup if no feature is active
        if (!activeTourFeature) {
            if (tourPopup.current) {
                tourPopup.current.remove();
                tourPopup.current = null;
            }
            if (tourPopupRoot.current) {
                tourPopupRoot.current.unmount();
                tourPopupRoot.current = null;
            }
            return;
        }

        const coordinates = activeTourFeature.geometry.type === 'Point'
            ? activeTourFeature.geometry.coordinates as [number, number]
            : [0, 0] as [number, number];
        
        // Remove existing tour popup
        if (tourPopup.current) tourPopup.current.remove();
        if (tourPopupRoot.current) {
            tourPopupRoot.current.unmount();
            tourPopupRoot.current = null;
        }

        tourPopup.current = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false,
            maxWidth: '400px',
            className: 'tour-popup subject-popup',
            offset: [0, -10]
        });

        const popupContent = renderPopup(activeTourFeature);
        const container = document.createElement('div');
        tourPopupRoot.current = createRoot(container);
        tourPopupRoot.current.render(popupContent);

        tourPopup.current
            .setLngLat(coordinates)
            .setDOMContent(container)
            .addTo(map.current);

    }, [activeTourFeature, renderPopup]);

    // Handle Map events for Tour Pausing
    const handleTourPauseTrigger = useCallback(() => {
        if (onTourPause) onTourPause(true);
    }, [onTourPause]);

    const handleTourResumeTrigger = useCallback(() => {
        if (onTourPause) onTourPause(false);
    }, [onTourPause]);

    // Create a stable mapping of string IDs to integers for Mapbox feature-state
    // This is essential for high-performance animations and must be consistent across effects
    const idToIntegerMap = useMemo(() => {
        const idMap = new Map<string, number>();
        features.forEach((f, i) => idMap.set(f.id, i + 1));
        return idMap;
    }, [features]);

    // Memoize the center coordinates only for initial setup
    const initialCenterCoords = useMemo(() => {
        if (center) return center;
        return guessCenterFromFeatures(features);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty dependency array - only calculate once

    const rotateCamera = useCallback((timestamp: number) => {
        if (!map.current) return
        map.current.rotateTo((timestamp / ANIMATE_ROTATION_SPEED) % 360, { duration: 0 })
        animationFrame.current = requestAnimationFrame(rotateCamera)
    }, [])

    // Memoize event handlers
    const handleFeatureHover = useCallback((e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
        if (!map.current || !e.features || e.features.length === 0) return;

        // Prioritize point features (subjects) over polygon features (cities)
        // This prevents flickering when hovering over a point that sits on top of a polygon
        const feature = e.features.find(f => f.geometry.type === 'Point') || e.features[0];
        if (!feature.properties) return;

        const featureId = feature.properties.uniqueFeatureId;
        const isSupported = feature.properties.officialSupport;

        // If we're hovering the same feature, don't do anything to prevent flickering
        if (currentHoveredFeature.current === featureId) {
            // Just update popup position if it exists, don't recreate
            if (popup.current && popup.current.isOpen() && renderPopup) {
                popup.current.setLngLat(e.lngLat);
            }
            return;
        }

        // ANTI-FLICKERING: If we're currently on a subject (point) and now detect a city (polygon),
        // ignore the city to prevent flickering when the cursor is near the edge of a point
        const currentFeatureIsSubject = currentHoveredFeature.current?.startsWith('subject-');
        const newFeatureIsCity = feature.geometry.type !== 'Point';
        if (currentFeatureIsSubject && newFeatureIsCity) {
            return;
        }

        currentHoveredFeature.current = featureId;

        map.current.getCanvas().style.cursor = 'pointer';

        // Use unique feature ID property for precise highlighting
        const featureFilter = ['==', ['get', 'uniqueFeatureId'], featureId];

        if (feature.geometry.type === 'Point') {
            // Handle point features - slightly enlarge on hover
            map.current.setPaintProperty('feature-points', 'circle-radius', [
                'case',
                featureFilter,
                ['*', ['get', 'strokeWidth'], 1.3],
                ['get', 'strokeWidth']
            ]);

            map.current.setPaintProperty('feature-points', 'circle-opacity', [
                'case',
                featureFilter,
                1,
                ['get', 'fillOpacity']
            ]);
        } else {
            // For supported cities: borders already visible, just make slightly thicker
            // For unsupported cities: show blue overlay AND border

            if (isSupported) {
                // Supported city: ONLY BORDER (orange), NO OVERLAY
                // Make border slightly thicker on hover
                map.current.setPaintProperty('feature-borders', 'line-width', [
                    'case',
                    featureFilter,
                    2.5,
                    ['get', 'strokeWidth']
                ]);

                map.current.setPaintProperty('feature-borders', 'line-opacity', [
                    'case',
                    featureFilter,
                    0.9,
                    0.6
                ]);

                // Ensure NO FILL for supported cities
                map.current.setPaintProperty('feature-fills', 'fill-opacity', [
                    'case',
                    featureFilter,
                    0,
                    ['get', 'fillOpacity']
                ]);
            } else {
                // Unsupported city: show ONLY blue border on hover
                // Keep existing petition heatmap fill untouched
                // No timeout - instant feedback

                // Show soft blue BORDER - only for the hovered feature
                map.current.setPaintProperty('feature-borders', 'line-width', [
                    'case',
                    featureFilter,
                    2,
                    ['get', 'strokeWidth']
                ]);

                map.current.setPaintProperty('feature-borders', 'line-opacity', [
                    'case',
                    featureFilter,
                    0.8,
                    ['get', 'strokeOpacity']
                ]);
            }
        }

        if (renderPopup) {
            const coordinates = e.lngLat;

            // Always clean up existing popup first
            if (popup.current) {
                popup.current.remove();
            }
            if (popupRoot.current) {
                popupRoot.current.unmount();
                popupRoot.current = null;
            }

            // Create new popup for the current feature
            popup.current = new mapboxgl.Popup({
                closeButton: false,
                closeOnClick: false,
                maxWidth: '400px',
                className: feature.properties?.featureType === 'city' ? 'municipality-popup' : 'subject-popup',
                offset: feature.geometry.type === 'Point' ? [0, -10] : [0, -15]
            });

            const popupContent = renderPopup(feature);
            const container = document.createElement('div');

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

        // Clear hover timeout for unsupported cities
        if (hoverTimeout.current) {
            clearTimeout(hoverTimeout.current);
            hoverTimeout.current = null;
        }

        // Reset current hovered feature
        currentHoveredFeature.current = null;

        map.current.getCanvas().style.cursor = '';
        map.current.setPaintProperty('feature-fills', 'fill-opacity', ['get', 'fillOpacity']);
        map.current.setPaintProperty('feature-points', 'circle-opacity', ['get', 'fillOpacity']);
        map.current.setPaintProperty('feature-points', 'circle-radius', ['get', 'strokeWidth']);
        map.current.setPaintProperty('feature-borders', 'line-width', ['get', 'strokeWidth']);
        map.current.setPaintProperty('feature-borders', 'line-opacity', ['get', 'strokeOpacity']);

        if (popupRoot.current) {
            popupRoot.current.unmount();
            popupRoot.current = null;
        }
        if (popup.current) {
            popup.current.remove();
        }
    }, []);

    const handleMapFeatureClick = useCallback((e: mapboxgl.MapMouseEvent) => {
        if (!onFeatureClick || !map.current) return;

        // Create 24px bounding box around tap point for mobile precision (12px radius)
        // This creates a "magnetic" zone that makes subjects easier to tap on mobile
        const bbox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
            [e.point.x - 12, e.point.y - 12],
            [e.point.x + 12, e.point.y + 12]
        ];

        // Query all features within the bounding box
        const features = map.current.queryRenderedFeatures(bbox, {
            layers: ['feature-points', 'feature-fills']
        });

        if (features.length === 0) return;

        // Prioritize subjects (points) over cities (fills)
        // Filter all point features
        const pointFeatures = features.filter(f => f.layer?.id === 'feature-points');

        if (pointFeatures.length === 0) {
            // No subjects found, select city polygon
            onFeatureClick(features[0]);
            return;
        }

        if (pointFeatures.length === 1) {
            // Single subject, select it
            onFeatureClick(pointFeatures[0]);
            return;
        }

        // Multiple subjects found - select the closest one by Euclidean distance
        const closestFeature = pointFeatures.sort((a, b) => {
            const coordsA = a.geometry.type === 'Point' ? a.geometry.coordinates : [0, 0];
            const coordsB = b.geometry.type === 'Point' ? b.geometry.coordinates : [0, 0];

            const distA = Math.hypot(
                coordsA[0] - e.lngLat.lng,
                coordsA[1] - e.lngLat.lat
            );
            const distB = Math.hypot(
                coordsB[0] - e.lngLat.lng,
                coordsB[1] - e.lngLat.lat
            );

            return distA - distB;
        })[0];

        onFeatureClick(closestFeature);
    }, [onFeatureClick]);

    // Handle drawing events
    const handleDrawCreate = useCallback((e: { features: GeoJSON.Feature[] }) => {
        const feature = e.features[0];
        if (process.env.NODE_ENV === 'development') {
            console.log('🗺️ GeoJSON Generated:', JSON.stringify(feature.geometry, null, 2));
            console.log('📍 Feature:', feature);
            console.log('🎯 Selected Geometry ID for Edit:', selectedGeometryRef.current);
        }

        // Save to localStorage if we have a selected geometry
        if (selectedGeometryRef.current) {
            try {
                const savedGeometries = JSON.parse(localStorage.getItem('opencouncil-edited-geometries') || '{}');
                savedGeometries[selectedGeometryRef.current] = feature.geometry;
                localStorage.setItem('opencouncil-edited-geometries', JSON.stringify(savedGeometries));

                // Dispatch custom event to notify components of localStorage change
                window.dispatchEvent(new CustomEvent('opencouncil-storage-change'));

                if (process.env.NODE_ENV === 'development') {
                    console.log(`💾 Saved geometry for ID: ${selectedGeometryRef.current}`);
                    console.log('📦 All saved geometries:', savedGeometries);
                }
            } catch (error) {
                console.error('Error saving geometry to localStorage:', error);
            }
        } else {
            if (process.env.NODE_ENV === 'development') {
                console.warn('⚠️ No geometry selected for editing - geometry not saved');
            }
        }

        // Clear the drawing to allow creating more features
        if (draw.current) {
            draw.current.deleteAll();
        }
    }, []);

    const handleDrawUpdate = useCallback((e: { features: GeoJSON.Feature[] }) => {
        const feature = e.features[0];
        if (process.env.NODE_ENV === 'development') {
            console.log('🔄 GeoJSON Updated:', JSON.stringify(feature.geometry, null, 2));
            console.log('🎯 Selected Geometry ID for Edit:', selectedGeometryRef.current);
        }

        // Also save updates to localStorage
        if (selectedGeometryRef.current) {
            try {
                const savedGeometries = JSON.parse(localStorage.getItem('opencouncil-edited-geometries') || '{}');
                savedGeometries[selectedGeometryRef.current] = feature.geometry;
                localStorage.setItem('opencouncil-edited-geometries', JSON.stringify(savedGeometries));

                // Dispatch custom event to notify components of localStorage change
                window.dispatchEvent(new CustomEvent('opencouncil-storage-change'));

                if (process.env.NODE_ENV === 'development') {
                    console.log(`💾 Updated geometry for ID: ${selectedGeometryRef.current}`);
                }
            } catch (error) {
                console.error('Error updating geometry in localStorage:', error);
            }
        } else {
            if (process.env.NODE_ENV === 'development') {
                console.warn('⚠️ No geometry selected for editing - geometry update not saved');
            }
        }
    }, []);

    useEffect(() => {
        if (draw.current && selectedGeometryForEdit) {
            // Find the geometry from the features prop
            const featureToEdit = features.find(f => f.id === selectedGeometryForEdit);
            if (featureToEdit && featureToEdit.geometry) {
                // Clear any existing drawings
                draw.current.deleteAll();

                // Add the selected geometry to the map for editing
                const featureId = draw.current.add(featureToEdit.geometry)[0];

                // Choose appropriate editing mode based on geometry type
                if (featureToEdit.geometry.type === 'Point') {
                    // For point features, use simple_select mode to allow dragging/moving
                    draw.current.changeMode('simple_select', { featureIds: [featureId] });
                } else {
                    // For polygon and linestring features, use direct_select mode for vertex editing
                    draw.current.changeMode('direct_select', { featureId });
                }
            }
        }
    }, [selectedGeometryForEdit, features]);

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
            setIsInitialized(true);

            if (animateRotation) {
                animationFrame.current = requestAnimationFrame(rotateCamera);
            }

            // Initialize source and layers
            map.current?.addSource('features', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: features.map((feature) => ({
                        type: 'Feature',
                        id: idToIntegerMap.get(feature.id), // Use the stable mapped integer ID
                        geometry: feature.geometry,
                        properties: {
                            id: feature.id,
                            uniqueFeatureId: feature.id,
                            subjectId: feature.id,
                            ...feature.properties,
                            fillColor: feature.style?.fillColor || '#627BBC',
                            fillOpacity: feature.style?.fillOpacity ?? 0.4,
                            strokeColor: feature.style?.strokeColor || '#627BBC',
                            strokeWidth: feature.style?.strokeWidth ?? 2,
                            strokeOpacity: feature.style?.strokeOpacity ?? 0.8,
                            label: feature.style?.label || ''
                        }
                    }))
                }
            });

            // Add layers - ORDER MATTERS: fills first, then borders, then points on top
            map.current?.addLayer({
                'id': 'feature-fills',
                'type': 'fill',
                'source': 'features',
                'filter': ['!=', ['geometry-type'], 'Point'], // Exclude points from fills
                'paint': {
                    'fill-color': ['get', 'fillColor'],
                    'fill-opacity': ['get', 'fillOpacity'],
                    'fill-opacity-transition': {
                        duration: 200,
                        delay: 0
                    }
                }
            });

            // Dedicated Pulse Layer - Sits on top of fills but under borders
            // This prevents the pulse from being overwritten by hover effects
            map.current?.addLayer({
                'id': 'feature-pulse',
                'type': 'fill',
                'source': 'features',
                'filter': ['all', 
                    ['==', ['get', 'featureType'], 'city'], 
                    ['>=', ['get', 'petitionCount'], 25],
                    ['!', ['get', 'officialSupport']]
                ],
                'paint': {
                    'fill-color': 'hsl(212, 100%, 45%)',
                    'fill-opacity': 0
                }
            });

            map.current?.addLayer({
                'id': 'feature-borders',
                'type': 'line',
                'source': 'features',
                'filter': ['!=', ['geometry-type'], 'Point'], // Exclude points from borders
                'paint': {
                    'line-color': ['get', 'strokeColor'],
                    'line-width': ['get', 'strokeWidth'],
                    'line-opacity': ['get', 'strokeOpacity'],
                    'line-width-transition': {
                        duration: 200,
                        delay: 0
                    },
                    'line-opacity-transition': {
                        duration: 200,
                        delay: 0
                    }
                }
            });

            map.current?.addLayer({
                'id': 'feature-labels',
                'type': 'symbol',
                'source': 'features',
                'filter': ['!=', ['geometry-type'], 'Point'], // Exclude points from labels
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

            // Points layer - render LAST so it's on top
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
                    'circle-stroke-color': ['get', 'strokeColor'],
                    'circle-stroke-opacity': ['get', 'strokeOpacity'],
                    // Hardware-accelerated smooth transitions
                    'circle-radius-transition': {
                        duration: 200,
                        delay: 0
                    },
                    'circle-opacity-transition': {
                        duration: 200,
                        delay: 0
                    }
                }
            });

            // Shooting Star Source & Layer
            map.current?.addSource('tour-traveler', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: []
                }
            });

            map.current?.addLayer({
                'id': 'tour-traveler-layer',
                'type': 'circle',
                'source': 'tour-traveler',
                'paint': {
                    'circle-radius': 6,
                    'circle-color': '#fff',
                    'circle-blur': 0.8,
                    'circle-opacity': 0.9,
                    'circle-stroke-width': 4,
                    'circle-stroke-color': '#3b82f6',
                    'circle-stroke-opacity': 0.4
                }
            });

            // Add event listeners
            // Use a single map-wide click handler to prevent dual sidebar bug
            if (onFeatureClick) {
                map.current?.on('click', handleMapFeatureClick);
            }

            map.current?.on('mousemove', 'feature-fills', handleFeatureHover);
            map.current?.on('mouseleave', 'feature-fills', handleFeatureLeave);
            map.current?.on('mousemove', 'feature-points', handleFeatureHover);
            map.current?.on('mouseleave', 'feature-points', handleFeatureLeave);

            // Tour interaction listeners
            map.current?.on('mouseenter', 'feature-fills', handleTourPauseTrigger);
            map.current?.on('mouseleave', 'feature-fills', handleTourResumeTrigger);
            map.current?.on('mousedown', handleTourPauseTrigger);
        });

        return () => {
            if (animationFrame.current) {
                cancelAnimationFrame(animationFrame.current);
            }
            if (popupRoot.current) {
                popupRoot.current.unmount();
            }
            if (tourPopupRoot.current) {
                tourPopupRoot.current.unmount();
            }
            if (popup.current) {
                popup.current.remove();
            }
            if (tourPopup.current) {
                tourPopup.current.remove();
            }
            resizeObserver.disconnect();
            map.current?.remove();
            map.current = null;
            setIsInitialized(false);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty dependency array - initialize only once

    // Handle feature updates without resetting zoom/center
    useEffect(() => {
        if (!map.current || !isInitialized) {
            return;
        }

        const source = map.current.getSource('features') as mapboxgl.GeoJSONSource;
        if (!source) {
            return;
        }

        // Update source data without changing zoom/center
        source.setData({
            type: 'FeatureCollection',
            features: features.map((feature) => ({
                type: 'Feature',
                id: idToIntegerMap.get(feature.id), // Use the stable mapped integer ID
                geometry: feature.geometry,
                properties: {
                    id: feature.id,
                    uniqueFeatureId: feature.id,
                    subjectId: feature.id,
                    ...feature.properties,
                    fillColor: feature.style?.fillColor || '#627BBC',
                    fillOpacity: feature.style?.fillOpacity ?? 0.4,
                    strokeColor: feature.style?.strokeColor || '#627BBC',
                    strokeWidth: feature.style?.strokeWidth ?? 2,
                    strokeOpacity: feature.style?.strokeOpacity ?? 0.8,
                    label: feature.style?.label || ''
                }
            }))
        });
    }, [features, idToIntegerMap, isInitialized]);

    // Only update center/zoom if explicitly changed via props AND user hasn't interacted
    useEffect(() => {
        if (!map.current || !isInitialized || isUserInteracted.current) return;

        // If center prop changes explicitly, update it
        if (center && (currentCenter.current?.[0] !== center[0] || currentCenter.current?.[1] !== center[1])) {
            map.current.setCenter(center);
            currentCenter.current = center;
        }
    }, [center]);

    useEffect(() => {
        if (!map.current || !isInitialized || isUserInteracted.current) return;

        // If zoom prop changes explicitly, update it
        if (zoom !== currentZoom.current) {
            map.current.setZoom(zoom);
            currentZoom.current = zoom;
        }
    }, [zoom]);

    // Handle editing mode - add/remove street name layers
    useEffect(() => {
        if (!map.current || !isInitialized) return;

        if (editingMode) {
            // Add street data source if it doesn't exist
            if (!map.current.getSource('mapbox-streets')) {
                map.current.addSource('mapbox-streets', {
                    'type': 'vector',
                    'url': 'mapbox://mapbox.mapbox-streets-v8'
                });
            }

            // Add major street names layer
            if (!map.current.getLayer('major-street-labels')) {
                map.current.addLayer({
                    'id': 'major-street-labels',
                    'type': 'symbol',
                    'source': 'mapbox-streets',
                    'source-layer': 'road',
                    'layout': {
                        'text-field': ['get', 'name'],
                        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                        'text-size': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            10, 12,
                            16, 16
                        ],
                        'text-anchor': 'center',
                        'text-offset': [0, 0],
                        'text-rotation-alignment': 'map',
                        'text-pitch-alignment': 'viewport',
                        'symbol-placement': 'line',
                        'text-max-angle': 30
                    },
                    'paint': {
                        'text-color': '#222222',
                        'text-halo-color': '#ffffff',
                        'text-halo-width': 2,
                        'text-opacity': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            10, 0.8,
                            16, 1
                        ]
                    },
                    'filter': [
                        'all',
                        ['has', 'name'],
                        ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary']
                    ]
                });
            }

            // Add regular street names layer (including smaller roads)
            if (!map.current.getLayer('street-labels')) {
                map.current.addLayer({
                    'id': 'street-labels',
                    'type': 'symbol',
                    'source': 'mapbox-streets',
                    'source-layer': 'road',
                    'layout': {
                        'text-field': ['get', 'name'],
                        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                        'text-size': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            12, 10,
                            18, 14
                        ],
                        'text-anchor': 'center',
                        'text-offset': [0, 0],
                        'text-rotation-alignment': 'map',
                        'text-pitch-alignment': 'viewport',
                        'symbol-placement': 'line',
                        'text-max-angle': 30,
                        'text-allow-overlap': false,
                        'text-ignore-placement': false
                    },
                    'paint': {
                        'text-color': '#444444',
                        'text-halo-color': '#ffffff',
                        'text-halo-width': 1.5,
                        'text-opacity': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            12, 0.6,
                            18, 1
                        ]
                    },
                    'filter': [
                        'all',
                        ['has', 'name'],
                        ['in', 'class', 'street', 'street_limited']
                    ],
                    'minzoom': 12
                });
            }

            // Add small roads and paths layer
            if (!map.current.getLayer('minor-road-labels')) {
                map.current.addLayer({
                    'id': 'minor-road-labels',
                    'type': 'symbol',
                    'source': 'mapbox-streets',
                    'source-layer': 'road',
                    'layout': {
                        'text-field': ['get', 'name'],
                        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                        'text-size': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            14, 9,
                            18, 12
                        ],
                        'text-anchor': 'center',
                        'text-offset': [0, 0],
                        'text-rotation-alignment': 'map',
                        'text-pitch-alignment': 'viewport',
                        'symbol-placement': 'line',
                        'text-max-angle': 45,
                        'text-allow-overlap': false,
                        'text-ignore-placement': false
                    },
                    'paint': {
                        'text-color': '#666666',
                        'text-halo-color': '#ffffff',
                        'text-halo-width': 1,
                        'text-opacity': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            14, 0.5,
                            18, 0.9
                        ]
                    },
                    'filter': [
                        'all',
                        ['has', 'name'],
                        ['in', 'class', 'service', 'path', 'pedestrian', 'track', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']
                    ],
                    'minzoom': 14
                });
            }

            // Add place labels (enhanced to show more types)
            if (!map.current.getLayer('place-labels')) {
                map.current.addLayer({
                    'id': 'place-labels',
                    'type': 'symbol',
                    'source': 'mapbox-streets',
                    'source-layer': 'place_label',
                    'layout': {
                        'text-field': ['get', 'name'],
                        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                        'text-size': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            10, 11,
                            16, 14
                        ],
                        'text-anchor': 'center'
                    },
                    'paint': {
                        'text-color': '#333333',
                        'text-halo-color': '#ffffff',
                        'text-halo-width': 2,
                        'text-opacity': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            10, 0.8,
                            16, 1
                        ]
                    },
                    'filter': [
                        'all',
                        ['has', 'name'],
                        ['in', 'type', 'neighbourhood', 'suburb', 'hamlet', 'village', 'locality']
                    ]
                });
            }

            // Add POI labels for landmarks
            if (!map.current.getLayer('poi-labels')) {
                map.current.addLayer({
                    'id': 'poi-labels',
                    'type': 'symbol',
                    'source': 'mapbox-streets',
                    'source-layer': 'poi_label',
                    'layout': {
                        'text-field': ['get', 'name'],
                        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                        'text-size': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            14, 10,
                            18, 12
                        ],
                        'text-anchor': 'top',
                        'text-offset': [0, 0.5],
                        'icon-image': ['get', 'maki'],
                        'icon-size': 0.8
                    },
                    'paint': {
                        'text-color': '#555555',
                        'text-halo-color': '#ffffff',
                        'text-halo-width': 1,
                        'text-opacity': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            14, 0.7,
                            18, 1
                        ]
                    },
                    'filter': [
                        'all',
                        ['has', 'name'],
                        ['in', 'class', 'park', 'education', 'medical', 'shopping', 'lodging']
                    ],
                    'minzoom': 14
                });
            }

        } else {
            // Remove all street and place layers when exiting editing mode
            const layersToRemove = [
                'major-street-labels',
                'street-labels',
                'minor-road-labels',
                'place-labels',
                'poi-labels'
            ];

            layersToRemove.forEach(layerId => {
                if (map.current?.getLayer(layerId)) {
                    map.current.removeLayer(layerId);
                }
            });

            // Remove the source too
            if (map.current?.getSource('mapbox-streets')) {
                map.current.removeSource('mapbox-streets');
            }
        }
    }, [editingMode]);

    // Handle pulse animation for trending features
    useEffect(() => {
        if (!map.current || !isInitialized) return;

        let startTime = Date.now();
        let animationId: number;

        const animatePulse = () => {
            const duration = 3000;
            const elapsed = Date.now() - startTime;
            const progress = (elapsed % duration) / duration;
            
            // Smoother Sine wave for the dedicated pulse layer
            const opacity = 0.1 + (Math.sin(progress * Math.PI * 2) + 1) * 0.12;

            if (map.current?.getLayer('feature-pulse')) {
                map.current.setPaintProperty('feature-pulse', 'fill-opacity', opacity);
            }

            animationId = requestAnimationFrame(animatePulse);
        };
        animatePulse();

        return () => {
            if (animationId) cancelAnimationFrame(animationId);
        };
    }, [features, isInitialized]);

    // Handle Mapbox GL Draw setup for editing mode
    useEffect(() => {
        if (!map.current || !isInitialized) return;

        if (editingMode && selectedGeometryForEdit) {
            // Initialize Mapbox GL Draw if not already done
            if (!draw.current) {
                draw.current = new MapboxDraw({
                    displayControlsDefault: false,
                    controls: {},
                    styles: [
                        // Custom styles for drawing
                        {
                            'id': 'gl-draw-polygon-fill-inactive',
                            'type': 'fill',
                            'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
                            'paint': {
                                'fill-color': '#3f90ff',
                                'fill-outline-color': '#3f90ff',
                                'fill-opacity': 0.1
                            }
                        },
                        {
                            'id': 'gl-draw-polygon-fill-active',
                            'type': 'fill',
                            'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
                            'paint': {
                                'fill-color': '#fbb03b',
                                'fill-outline-color': '#fbb03b',
                                'fill-opacity': 0.1
                            }
                        },
                        {
                            'id': 'gl-draw-polygon-stroke-inactive',
                            'type': 'line',
                            'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
                            'layout': {
                                'line-cap': 'round',
                                'line-join': 'round'
                            },
                            'paint': {
                                'line-color': '#3f90ff',
                                'line-width': 2
                            }
                        },
                        {
                            'id': 'gl-draw-polygon-stroke-active',
                            'type': 'line',
                            'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
                            'layout': {
                                'line-cap': 'round',
                                'line-join': 'round'
                            },
                            'paint': {
                                'line-color': '#fbb03b',
                                'line-width': 2
                            }
                        },
                        {
                            'id': 'gl-draw-point-inactive',
                            'type': 'circle',
                            'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
                            'paint': {
                                'circle-radius': 8,
                                'circle-color': '#3f90ff'
                            }
                        },
                        {
                            'id': 'gl-draw-point-active',
                            'type': 'circle',
                            'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Point']],
                            'paint': {
                                'circle-radius': 8,
                                'circle-color': '#fbb03b'
                            }
                        }
                    ]
                });

                map.current.addControl(draw.current, 'top-left');
            }

            // IMPORTANT: Always refresh event listeners when selectedGeometryForEdit changes
            // This ensures the handlers capture the latest geometry ID
            if (draw.current && map.current) {
                // Remove existing listeners
                map.current.off('draw.create', handleDrawCreate);
                map.current.off('draw.update', handleDrawUpdate);

                // Add fresh listeners with updated callback references
                map.current.on('draw.create', handleDrawCreate);
                map.current.on('draw.update', handleDrawUpdate);
            }

            // Change drawing mode based on drawingMode prop
            if (draw.current) {
                const currentMode = draw.current.getMode();

                if (drawingMode === 'point' && currentMode !== 'draw_point') {
                    draw.current.changeMode('draw_point');
                } else if (drawingMode === 'polygon' && currentMode !== 'draw_polygon') {
                    draw.current.changeMode('draw_polygon');
                }
            }
        } else {
            // Remove drawing control when exiting editing mode
            if (draw.current && map.current) {
                map.current.removeControl(draw.current);
                map.current.off('draw.create', handleDrawCreate);
                map.current.off('draw.update', handleDrawUpdate);
                draw.current = null;
            }
        }
    }, [editingMode, drawingMode, selectedGeometryForEdit, handleDrawCreate, handleDrawUpdate, isInitialized]);

    // Update ref when selectedGeometryForEdit changes
    useEffect(() => {
        selectedGeometryRef.current = selectedGeometryForEdit;
        if (selectedGeometryForEdit) {
            if (process.env.NODE_ENV === 'development') {
                console.log('🎯 Updated selected geometry ref to:', selectedGeometryForEdit);
            }
        }
    }, [selectedGeometryForEdit]);

    // Expose zoom functionality via callback
    useEffect(() => {
        if (zoomToGeometry && map.current && isInitialized) {
            const performZoom = (geometry: GeoJSON.Geometry) => {
                try {
                    const bounds = calculateGeometryBounds(geometry);

                    if (bounds.bounds) {
                        // Add some padding around the geometry
                        const padding = 100; // pixels

                        map.current?.fitBounds([
                            [bounds.bounds.minLng, bounds.bounds.minLat],
                            [bounds.bounds.maxLng, bounds.bounds.maxLat]
                        ], {
                            padding: padding,
                            maxZoom: 16 // Don't zoom in too much for small geometries
                        });

                        if (process.env.NODE_ENV === 'development') {
                            console.log('🔍 Zoomed to geometry bounds:', bounds);
                        }
                    } else {
                        // For single points, just center on them
                        if (geometry.type === 'Point') {
                            const coordinates = geometry.coordinates as [number, number];
                            map.current?.easeTo({
                                center: coordinates,
                                zoom: 15
                            });
                            if (process.env.NODE_ENV === 'development') {
                                console.log('🔍 Centered on point:', coordinates);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error zooming to geometry:', error);
                }
            };

            // Perform the zoom
            performZoom(zoomToGeometry);
        }
    }, [zoomToGeometry, isInitialized]);

    return (
        <div ref={mapContainer} className={cn("w-full h-full", className)} />
    );
});

export default MapComponent;
