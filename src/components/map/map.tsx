"use client"
import { useRef, useEffect } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { cn } from '@/lib/utils'

interface MapProps {
    className?: string
    center?: [number, number] // Longitude, latitude coordinates
    zoom?: number
    animateRotation?: boolean
    pitch?: number
}

const ANIMATE_ROTATION_SPEED = 1000;

export default function Map({
    className,
    center = [23.7275, 37.9838], // Default to Athens coordinates
    zoom = 12, // Default zoom level
    animateRotation = true,
    pitch = 45
}: MapProps) {
    const mapContainer = useRef<HTMLDivElement>(null)
    const map = useRef<mapboxgl.Map | null>(null)

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

        if (animateRotation) {
            map.current.on('load', () => {
                // Start rotation animation
                rotateCamera(0)

                // Add world coverage and AOI cutout
                map.current!.addSource('world-and-aoi', {
                    'type': 'geojson',
                    // @ts-ignore
                    'data': {
                        'type': 'Feature',
                        'geometry': {
                            'type': 'Polygon',
                            'coordinates': [
                                [
                                    [-180, -90],
                                    [-180, 90],
                                    [180, 90],
                                    [180, -90],
                                    [-180, -90]
                                ],
                                ...AOI_POLYGON[0] // This creates a hole in the world polygon
                            ]
                        }
                    }
                });

                map.current!.addLayer({
                    'id': 'world-mask',
                    'type': 'fill',
                    'source': 'world-and-aoi',
                    'paint': {
                        'fill-color': '#ffffff',
                        'fill-opacity': 0.8
                    }
                });

                // Add 3D buildings
                const style = map.current!.getStyle();
                if (!style) return;
                const layers = style.layers;
                if (!layers) return;
                for (const layer of layers) {
                    if (layer.type === 'symbol' && layer.layout && 'text-field' in layer.layout) {
                        map.current?.removeLayer(layer.id)
                    }
                }

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
        }

        return () => {
            resizeObserver.disconnect()
            map.current?.remove()
        }
    }, [center, zoom, animateRotation, pitch])

    return (
        <div ref={mapContainer} className={cn("w-full h-full", className)} />
    )
}
