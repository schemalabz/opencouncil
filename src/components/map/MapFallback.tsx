"use client"

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { env } from '@/env.mjs'
import { MapPin } from 'lucide-react'

// Default center: Athens, Greece
const DEFAULT_CENTER: [number, number] = [23.7275, 37.9838]

function getStaticMapUrl(
    center: [number, number],
    width: number,
    height: number
): string {
    const token = env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
    const [lng, lat] = center
    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${lng},${lat},10,0/${width}x${height}@2x?access_token=${token}`
}

interface MapFallbackProps {
    className?: string
    center?: [number, number]
}

export default function MapFallback({ className, center }: MapFallbackProps) {
    const t = useTranslations('Common')
    const mapCenter = center ?? DEFAULT_CENTER

    return (
        <div className={cn("relative w-full h-full overflow-hidden bg-muted", className)}>
            {/* Static map background */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={getStaticMapUrl(mapCenter, 800, 600)}
                alt={t('municipalityMap')}
                className="absolute inset-0 w-full h-full object-cover opacity-50"
                loading="lazy"
            />

            {/* Fallback message overlay */}
            <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="bg-background/95 backdrop-blur-sm border border-border rounded-lg p-6 max-w-sm text-center shadow-lg">
                    <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <MapPin className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground mb-1.5">
                        {t('webglNotSupported')}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        {t('webglFallbackMessage')}
                    </p>
                </div>
            </div>
        </div>
    )
}
