"use client"

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { env } from '@/env.mjs'
// The interactive map's custom style doesn't render in the Static Images API,
// so we use a standard Mapbox style for the fallback.
const STATIC_MAP_STYLE = 'mapbox/light-v11'

// Default center: Athens, Greece
const DEFAULT_CENTER: [number, number] = [23.7275, 37.9838]

// Max URL length for Mapbox Static Images API
const MAX_URL_LENGTH = 8192

interface FallbackFeature {
    geometry: { type: string; coordinates: any }
    style?: {
        fillColor?: string
        fillOpacity?: number
        strokeColor?: string
        strokeWidth?: number
        strokeOpacity?: number
    }
}

/**
 * Simplify a coordinate ring by sampling every Nth point.
 * Ensures the ring stays closed and has at least 4 points.
 */
function simplifyRing(ring: number[][], maxPoints: number): number[][] {
    if (ring.length <= maxPoints) return ring
    const step = Math.max(1, Math.floor((ring.length - 1) / (maxPoints - 1)))
    const simplified: number[][] = []
    for (let i = 0; i < ring.length - 1; i += step) {
        simplified.push(ring[i].map(c => Math.round(c * 10000) / 10000))
    }
    simplified.push(simplified[0])
    return simplified
}

function simplifyGeometry(geometry: FallbackFeature['geometry'], maxPoints: number): FallbackFeature['geometry'] {
    if (geometry.type === 'Polygon') {
        return {
            type: 'Polygon',
            coordinates: geometry.coordinates.map((ring: number[][]) => simplifyRing(ring, maxPoints))
        }
    }
    if (geometry.type === 'MultiPolygon') {
        const pointsPerPolygon = Math.max(4, Math.floor(maxPoints / geometry.coordinates.length))
        return {
            type: 'MultiPolygon',
            coordinates: geometry.coordinates.map((polygon: number[][][]) =>
                polygon.map((ring: number[][]) => simplifyRing(ring, pointsPerPolygon))
            )
        }
    }
    return geometry
}

/**
 * Convert feature styles to simplestyle-spec properties for Mapbox Static API.
 * Points use marker-* properties, polygons use fill/stroke.
 */
function toSimplestyle(feature: FallbackFeature): Record<string, string | number> {
    if (feature.geometry.type === 'Point') {
        return {
            'marker-color': feature.style?.fillColor ?? '#4263EB',
            'marker-size': 'small',
        }
    }
    const props: Record<string, string | number> = {}
    if (feature.style?.fillColor) props['fill'] = feature.style.fillColor
    if (feature.style?.fillOpacity != null) props['fill-opacity'] = feature.style.fillOpacity
    if (feature.style?.strokeColor) props['stroke'] = feature.style.strokeColor
    if (feature.style?.strokeWidth != null) props['stroke-width'] = feature.style.strokeWidth
    if (feature.style?.strokeOpacity != null) props['stroke-opacity'] = feature.style.strokeOpacity
    return props
}

function getStaticMapUrl(
    center: [number, number],
    width: number,
    height: number,
    features?: FallbackFeature[]
): string {
    const token = env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

    const validFeatures = features?.filter(f =>
        f.geometry?.type === 'Polygon' ||
        f.geometry?.type === 'MultiPolygon' ||
        f.geometry?.type === 'Point'
    )

    if (validFeatures && validFeatures.length > 0) {
        const geojsonFeatures = validFeatures.map(f => ({
            type: 'Feature' as const,
            properties: toSimplestyle(f),
            geometry: f.geometry,
        }))

        // Try progressively simpler geometries until URL fits
        for (const maxPoints of [200, 100, 50, 25]) {
            const collection = {
                type: 'FeatureCollection',
                features: geojsonFeatures.map(f => ({
                    ...f,
                    geometry: simplifyGeometry(f.geometry, maxPoints),
                }))
            }

            const encoded = encodeURIComponent(JSON.stringify(collection))
            const url = `https://api.mapbox.com/styles/v1/${STATIC_MAP_STYLE}/static/geojson(${encoded})/auto/${width}x${height}@2x?access_token=${token}&padding=150`

            if (url.length <= MAX_URL_LENGTH) {
                return url
            }
        }
    }

    // Fallback: center-based static image without overlay
    const [lng, lat] = center
    return `https://api.mapbox.com/styles/v1/${STATIC_MAP_STYLE}/static/${lng},${lat},6,0/${width}x${height}@2x?access_token=${token}`
}

interface MapFallbackProps {
    className?: string
    center?: [number, number]
    features?: FallbackFeature[]
}

export default function MapFallback({ className, center, features }: MapFallbackProps) {
    const t = useTranslations('Common')
    const mapCenter = center ?? DEFAULT_CENTER

    return (
        <div className={cn("relative w-full h-full overflow-hidden bg-muted", className)}>
            {/* Static map with GeoJSON overlay when available */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={getStaticMapUrl(mapCenter, 800, 600, features)}
                alt={t('municipalityMap')}
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
            />

            {/* WebGL notice — top-right corner to not obscure map content */}
            <div className="absolute top-3 right-3 z-10">
                <div className="bg-background/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-sm max-w-xs">
                    <p className="text-xs text-muted-foreground">
                        {t('webglFallbackMessage')}
                    </p>
                </div>
            </div>
        </div>
    )
}
