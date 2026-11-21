"use client"

import { ErrorBoundary } from '@/components/ErrorBoundary'
import MapFallback from './MapFallback'
import type { AuthorityType } from '@prisma/client'

interface Props {
    children: React.ReactNode
    center?: [number, number]
    className?: string
    features?: { geometry: { type: string; coordinates: any }; style?: Record<string, any> }[]
    authorityType?: AuthorityType
}

/**
 * Catches runtime errors from the Map component (e.g. WebGL context lost,
 * Mapbox GL initialization failures) and renders a static fallback.
 */
export default function MapErrorBoundary({ children, center, className, features, authorityType }: Props) {
    return (
        <ErrorBoundary label="Map" fallback={<MapFallback center={center} className={className} features={features} authorityType={authorityType} />}>
            {children}
        </ErrorBoundary>
    )
}
