"use client"
import { useRef, useEffect } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { cn } from '@/lib/utils'

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
    features = []
}: MapProps) {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<mapboxgl.Map | null>(null)

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
                                ...feature.properties,
                                style: feature.style
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
                        'fill-color': [
                            'case',
                            ['has', 'style', ['properties']],
                            ['string', ['get', 'fillColor', ['get', 'style', ['properties']]]],
                            '#627BBC'
                        ],
                        'fill-opacity': [
                            'case',
                            ['has', 'style', ['properties']],
                            ['number', ['get', 'fillOpacity', ['get', 'style', ['properties']]]],
                            0.4
                        ]
                    }
                });

                // Add border layer
                map.current!.addLayer({
                    'id': 'feature-borders',
                    'type': 'line',
                    'source': 'features',
                    'paint': {
                        'line-color': [
                            'case',
                            ['has', 'style', ['properties']],
                            ['string', ['get', 'strokeColor', ['get', 'style', ['properties']]]],
                            '#627BBC'
                        ],
                        'line-width': [
                            'case',
                            ['has', 'style', ['properties']],
                            ['number', ['get', 'strokeWidth', ['get', 'style', ['properties']]]],
                            2
                        ]
                    }
                });

                // Add labels if specified
                map.current!.addLayer({
                    'id': 'feature-labels',
                    'type': 'symbol',
                    'source': 'features',
                    'layout': {
                        'text-field': [
                            'case',
                            ['has', 'style', ['properties']],
                            ['string', ['get', 'label', ['get', 'style', ['properties']]]],
                            ''
                        ],
                        'text-size': 12,
                        'text-anchor': 'center',
                        'text-optional': true
                    },
                    'paint': {
                        'text-color': '#000000'
                    }
                });

                // Add hover effect
                map.current!.on('mousemove', 'feature-fills', (e) => {
                    if (e.features && e.features.length > 0 && e.features[0].properties) {
                        map.current!.getCanvas().style.cursor = 'pointer'
                        const baseOpacity = e.features[0].properties.style?.fillOpacity ?? 0.4;
                        map.current!.setPaintProperty('feature-fills', 'fill-opacity', [
                            'case',
                            ['==', ['get', 'id'], e.features[0].properties.id],
                            Math.min(baseOpacity + 0.3, 1),
                            [
                                'case',
                                ['has', 'style', ['properties']],
                                ['number', ['get', 'fillOpacity', ['get', 'style', ['properties']]]],
                                0.4
                            ]
                        ])
                    }
                });

                map.current!.on('mouseleave', 'feature-fills', () => {
                    map.current!.getCanvas().style.cursor = ''
                    map.current!.setPaintProperty('feature-fills', 'fill-opacity', [
                        'case',
                        ['has', 'style', ['properties']],
                        ['number', ['get', 'fillOpacity', ['get', 'style', ['properties']]]],
                        0.4
                    ])
                });
            }

            // Add 3D buildings
            const style = map.current!.getStyle();
            if (!style) return;
            const layers = style.layers;
            if (!layers) return;

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
            })
        })

        return () => {
            resizeObserver.disconnect()
            map.current?.remove()
        }
    }, [center, zoom, animateRotation, pitch, features])

    return (
        <div ref={mapContainer} className={cn("w-full h-full", className)} />
    )
}
