"use client"
import { useRef, useEffect } from 'react'
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
    zoom = 12, // Default zoom level
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

    if (!center) {
        center = guessCenterFromFeatures(features);
        if (!center) {
            center = [23.7275, 37.9838];
        }
    }

    console.log(center);

    function rotateCamera(timestamp: number) {
        if (!map.current) return
        // Rotate camera by timestamp/100 degrees, clamped between 0-360
        map.current.rotateTo((timestamp / ANIMATE_ROTATION_SPEED) % 360, { duration: 0 })
        // Request next animation frame
        requestAnimationFrame(rotateCamera)
    }

    useEffect(() => {
        mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN!
        if (!mapContainer.current) return

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/christosporios/cm4icyrf700f201qw75bv27fa',
            center,
            zoom,
            pitch,
            attributionControl: false,
        })

        // Handle container resize
        const resizeObserver = new ResizeObserver(() => {
            map.current?.resize()
        })

        resizeObserver.observe(mapContainer.current)

        map.current.on('load', () => {
            if (animateRotation) {
                rotateCamera(0)
            }

            // Add features source and layers if we have features
            if (features.length > 0) {
                map.current!.addSource('features', {
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

                // Add fill layer
                map.current!.addLayer({
                    'id': 'feature-fills',
                    'type': 'fill',
                    'source': 'features',
                    'paint': {
                        'fill-color': ['get', 'fillColor'],
                        'fill-opacity': ['get', 'fillOpacity']
                    }
                });

                // Add border layer
                map.current!.addLayer({
                    'id': 'feature-borders',
                    'type': 'line',
                    'source': 'features',
                    'paint': {
                        'line-color': ['get', 'strokeColor'],
                        'line-width': ['get', 'strokeWidth']
                    }
                });

                // Add labels if specified
                map.current!.addLayer({
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

                // Add circle layer for points
                map.current!.addLayer({
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

                // Add hover effect for fills
                map.current!.on('mousemove', 'feature-fills', handleFeatureHover);
                map.current!.on('mouseleave', 'feature-fills', handleFeatureLeave);

                // Add hover effect for points
                map.current!.on('mousemove', 'feature-points', handleFeatureHover);
                map.current!.on('mouseleave', 'feature-points', handleFeatureLeave);

                // Add click handlers if needed
                if (onFeatureClick) {
                    const handleMapFeatureClick = (e: mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
                        if (e.features && e.features.length > 0 && onFeatureClick) {
                            onFeatureClick(e.features[0]);
                        }
                    };

                    map.current!.on('click', 'feature-fills', handleMapFeatureClick);
                    map.current!.on('click', 'feature-points', handleMapFeatureClick);
                    // Add touch handlers for mobile
                    map.current!.on('touchend', 'feature-fills', handleMapFeatureClick);
                    map.current!.on('touchend', 'feature-points', handleMapFeatureClick);
                }

                function handleFeatureHover(e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) {
                    if (e.features && e.features.length > 0 && e.features[0].properties) {
                        map.current!.getCanvas().style.cursor = 'pointer'
                        const baseOpacity = e.features[0].properties.fillOpacity || 0.4;

                        // Highlight the hovered feature
                        if (e.features[0].geometry.type === 'Point') {
                            map.current!.setPaintProperty('feature-points', 'circle-opacity', [
                                'case',
                                ['==', ['get', 'id'], e.features[0].properties.id],
                                Math.min(baseOpacity + 0.3, 1),
                                ['get', 'fillOpacity']
                            ]);
                        } else {
                            map.current!.setPaintProperty('feature-fills', 'fill-opacity', [
                                'case',
                                ['==', ['get', 'id'], e.features[0].properties.id],
                                Math.min(baseOpacity + 0.3, 1),
                                ['get', 'fillOpacity']
                            ]);
                        }

                        // Show popup if we have a render function and the feature has a subjectId
                        if (renderPopup && e.features[0].properties?.subjectId) {
                            console.log("Showing popup for subject:", e.features[0].properties.subjectId);
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

                            const popupContent = renderPopup(e.features[0]);
                            console.log("Popup content:", popupContent);
                            const container = document.createElement('div');

                            // Clean up previous root if it exists
                            if (popupRoot.current) {
                                popupRoot.current.unmount();
                            }

                            // Create new root and render content
                            popupRoot.current = createRoot(container);
                            popupRoot.current.render(popupContent);

                            popup.current
                                .setLngLat(coordinates)
                                .setDOMContent(container)
                                .addTo(map.current!);
                        } else {
                            console.log("Not showing popup:", {
                                hasRenderPopup: !!renderPopup,
                                subjectId: e.features[0].properties?.subjectId
                            });
                        }
                    }
                }

                function handleFeatureLeave() {
                    map.current!.getCanvas().style.cursor = ''

                    // Reset fill opacity
                    map.current!.setPaintProperty('feature-fills', 'fill-opacity', ['get', 'fillOpacity']);

                    // Reset point opacity
                    map.current!.setPaintProperty('feature-points', 'circle-opacity', ['get', 'fillOpacity']);

                    // Clean up popup and root
                    if (popupRoot.current) {
                        popupRoot.current.unmount();
                        popupRoot.current = null;
                    }
                    if (popup.current) {
                        popup.current.remove();
                    }
                }
            }

            // Add 3D buildings
            const style = map.current!.getStyle();
            if (!style) return;
            const layers = style.layers;
            if (!layers) return;

            // Only add 3D buildings if the composite source exists
            if (style.sources && style.sources.composite) {
                map.current!.addLayer({
                    'id': '3d-buildings',
                    'source': 'composite',
                    'source-layer': 'building',
                    'filter': ['==', 'extrude', 'true'],
                    'type': 'fill-extrusion',
                    'minzoom': 15,
                    'paint': {
                        'fill-extrusion-color': '#aaa',
                        'fill-extrusion-height': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            15,
                            0,
                            15.05,
                            ['get', 'height']
                        ],
                        'fill-extrusion-base': [
                            'interpolate',
                            ['linear'],
                            ['zoom'],
                            15,
                            0,
                            15.05,
                            ['get', 'min_height']
                        ],
                        'fill-extrusion-opacity': 0.6
                    }
                });
            }
        })

        return () => {
            resizeObserver.disconnect()
            map.current?.remove()
        }
    }, [center, zoom, animateRotation, pitch, features, onFeatureClick, renderPopup])

    return (
        <div ref={mapContainer} className={cn("w-full h-full", className)} />
    )
}
