"use client"
import { useRef, useEffect, useCallback, useMemo, memo } from 'react'
import mapboxgl from 'mapbox-gl'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
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
    editingMode?: boolean
    drawingMode?: 'point' | 'polygon'
    selectedGeometryForEdit?: string | null
    zoomToGeometry?: GeoJSON.Geometry | null
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
    renderPopup,
    editingMode = false,
    drawingMode = 'point',
    selectedGeometryForEdit = null,
    zoomToGeometry
}: MapProps) {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<mapboxgl.Map | null>(null)
    const popup = useRef<mapboxgl.Popup | null>(null)
    const popupRoot = useRef<ReturnType<typeof createRoot> | null>(null)
    const animationFrame = useRef<number | null>(null)
    const featuresRef = useRef(features)
    const isInitialized = useRef(false)
    const draw = useRef<MapboxDraw | null>(null)

    // Store user-controlled states in refs to preserve them during rerenders
    const isUserInteracted = useRef(false)
    const currentCenter = useRef<[number, number] | null>(null)
    const currentZoom = useRef(zoom)
    const selectedGeometryRef = useRef<string | null>(selectedGeometryForEdit)

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

        // Use unique feature ID property for precise highlighting
        const featureFilter = ['==', ['get', 'uniqueFeatureId'], feature.properties.uniqueFeatureId];

        if (feature.geometry.type === 'Point') {
            map.current.setPaintProperty('feature-points', 'circle-opacity', [
                'case',
                featureFilter,
                Math.min(baseOpacity + 0.05, 1),
                ['get', 'fillOpacity']
            ]);
        } else {
            map.current.setPaintProperty('feature-fills', 'fill-opacity', [
                'case',
                featureFilter,
                Math.min(baseOpacity + 0.05, 1),
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

    // Handle drawing events
    const handleDrawCreate = useCallback((e: any) => {
        const feature = e.features[0];
        console.log('🗺️ GeoJSON Generated:', JSON.stringify(feature.geometry, null, 2));
        console.log('📍 Feature:', feature);
        console.log('🎯 Selected Geometry ID for Edit:', selectedGeometryRef.current);

        // Save to localStorage if we have a selected geometry
        if (selectedGeometryRef.current) {
            try {
                const savedGeometries = JSON.parse(localStorage.getItem('opencouncil-edited-geometries') || '{}');
                savedGeometries[selectedGeometryRef.current] = feature.geometry;
                localStorage.setItem('opencouncil-edited-geometries', JSON.stringify(savedGeometries));

                // Dispatch custom event to notify components of localStorage change
                window.dispatchEvent(new CustomEvent('opencouncil-storage-change'));

                console.log(`💾 Saved geometry for ID: ${selectedGeometryRef.current}`);
                console.log('📦 All saved geometries:', savedGeometries);
            } catch (error) {
                console.error('Error saving geometry to localStorage:', error);
            }
        } else {
            console.warn('⚠️ No geometry selected for editing - geometry not saved');
        }

        // Clear the drawing to allow creating more features
        if (draw.current) {
            draw.current.deleteAll();
        }
    }, []);

    const handleDrawUpdate = useCallback((e: any) => {
        const feature = e.features[0];
        console.log('🔄 GeoJSON Updated:', JSON.stringify(feature.geometry, null, 2));
        console.log('🎯 Selected Geometry ID for Edit:', selectedGeometryRef.current);

        // Also save updates to localStorage
        if (selectedGeometryRef.current) {
            try {
                const savedGeometries = JSON.parse(localStorage.getItem('opencouncil-edited-geometries') || '{}');
                savedGeometries[selectedGeometryRef.current] = feature.geometry;
                localStorage.setItem('opencouncil-edited-geometries', JSON.stringify(savedGeometries));

                // Dispatch custom event to notify components of localStorage change
                window.dispatchEvent(new CustomEvent('opencouncil-storage-change'));

                console.log(`💾 Updated geometry for ID: ${selectedGeometryRef.current}`);
            } catch (error) {
                console.error('Error updating geometry in localStorage:', error);
            }
        } else {
            console.warn('⚠️ No geometry selected for editing - geometry update not saved');
        }
    }, []);

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
                    features: features.map((feature, index) => ({
                        type: 'Feature',
                        id: `${feature.id}-${index}`, // Ensure unique ID at feature level
                        geometry: feature.geometry,
                        properties: {
                            id: feature.id,
                            uniqueFeatureId: `${feature.id}-${index}`, // Unique property for precise highlighting
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
            features: features.map((feature, index) => ({
                type: 'Feature',
                id: `${feature.id}-${index}`, // Ensure unique ID at feature level
                geometry: feature.geometry,
                properties: {
                    id: feature.id,
                    uniqueFeatureId: `${feature.id}-${index}`, // Unique property for precise highlighting
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

    // Handle editing mode - add/remove street name layers
    useEffect(() => {
        if (!map.current || !isInitialized.current) return;

        if (editingMode) {
            // Add street data source if it doesn't exist
            if (!map.current.getSource('mapbox-streets')) {
                map.current.addSource('mapbox-streets', {
                    'type': 'vector',
                    'url': 'mapbox://mapbox.mapbox-streets-v8'
                });
            }

            // Add street names layer
            if (!map.current.getLayer('street-labels')) {
                map.current.addLayer({
                    'id': 'street-labels',
                    'type': 'symbol',
                    'source': 'mapbox-streets',
                    'source-layer': 'road',
                    'layout': {
                        'text-field': ['get', 'name'],
                        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
                        'text-size': 12,
                        'text-anchor': 'center',
                        'text-offset': [0, 0],
                        'text-rotation-alignment': 'map',
                        'text-pitch-alignment': 'viewport',
                        'symbol-placement': 'line',
                        'text-max-angle': 30
                    },
                    'paint': {
                        'text-color': '#333333',
                        'text-halo-color': '#ffffff',
                        'text-halo-width': 2,
                        'text-opacity': 0.8
                    },
                    'filter': [
                        'all',
                        ['has', 'name'],
                        ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'street', 'street_limited']
                    ]
                });
            }

            // Add place labels
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
                            14, 13
                        ],
                        'text-anchor': 'center'
                    },
                    'paint': {
                        'text-color': '#444444',
                        'text-halo-color': '#ffffff',
                        'text-halo-width': 2,
                        'text-opacity': 0.9
                    },
                    'filter': [
                        'all',
                        ['has', 'name'],
                        ['in', 'type', 'neighbourhood', 'suburb']
                    ]
                });
            }
        } else {
            // Remove street name layers when exiting editing mode
            if (map.current.getLayer('street-labels')) {
                map.current.removeLayer('street-labels');
            }
            if (map.current.getLayer('place-labels')) {
                map.current.removeLayer('place-labels');
            }
            // Optionally remove the source too
            if (map.current.getSource('mapbox-streets')) {
                map.current.removeSource('mapbox-streets');
            }
        }
    }, [editingMode]);

    // Handle Mapbox GL Draw setup for editing mode
    useEffect(() => {
        if (!map.current || !isInitialized.current) return;

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
    }, [editingMode, drawingMode, selectedGeometryForEdit, handleDrawCreate, handleDrawUpdate]);

    // Update ref when selectedGeometryForEdit changes
    useEffect(() => {
        selectedGeometryRef.current = selectedGeometryForEdit;
        if (selectedGeometryForEdit) {
            console.log('🎯 Updated selected geometry ref to:', selectedGeometryForEdit);
        }
    }, [selectedGeometryForEdit]);

    // Expose zoom functionality via callback
    useEffect(() => {
        if (zoomToGeometry && map.current && isInitialized.current) {
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

                        console.log('🔍 Zoomed to geometry bounds:', bounds);
                    } else {
                        // For single points, just center on them
                        if (geometry.type === 'Point') {
                            const coordinates = geometry.coordinates as [number, number];
                            map.current?.easeTo({
                                center: coordinates,
                                zoom: 15
                            });
                            console.log('🔍 Centered on point:', coordinates);
                        }
                    }
                } catch (error) {
                    console.error('Error zooming to geometry:', error);
                }
            };

            // Perform the zoom
            performZoom(zoomToGeometry);
        }
    }, [zoomToGeometry, isInitialized.current]);

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
        prevProps.editingMode === nextProps.editingMode &&
        prevProps.drawingMode === nextProps.drawingMode &&
        prevProps.selectedGeometryForEdit === nextProps.selectedGeometryForEdit &&
        prevProps.zoomToGeometry === nextProps.zoomToGeometry &&
        JSON.stringify(prevProps.features) === JSON.stringify(nextProps.features)
    );
})

export default Map;
