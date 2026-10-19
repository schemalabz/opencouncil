"use client"

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { publicEnv } from '@/lib/publicEnv'
import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { STATIC_MAP_STYLE, staticMapOverlayUrl, type StaticMapFeature } from '@/lib/map/staticMap'

// Default center: Athens, Greece
const DEFAULT_CENTER: [number, number] = [23.7275, 37.9838]

function getStaticMapUrl(
    center: [number, number],
    width: number,
    height: number,
    features?: StaticMapFeature[]
): string {
    const overlay = features && staticMapOverlayUrl({ features, position: 'auto', width, height, padding: 150 })
    if (overlay) return overlay

    // Fallback: center-based static image without overlay
    const [lng, lat] = center
    return `https://api.mapbox.com/styles/v1/${STATIC_MAP_STYLE}/static/${lng},${lat},6,0/${width}x${height}@2x?access_token=${publicEnv.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}`
}

interface MapFallbackProps {
    className?: string
    center?: [number, number]
    features?: StaticMapFeature[]
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
            <div className="absolute top-3 right-3 z-10 max-w-xs">
                <Alert variant="warning" className="shadow-sm backdrop-blur-sm bg-yellow-50/90 dark:bg-yellow-950/80 py-3">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                        {t('webglFallbackMessage')}
                    </AlertDescription>
                </Alert>
            </div>
        </div>
    )
}
