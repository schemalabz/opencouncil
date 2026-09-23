"use client"

import { ErrorBoundary } from '@/components/ErrorBoundary'
import MapFallback from './MapFallback'

interface Props {
    children: React.ReactNode
    center?: [number, number]
    className?: string
    features?: { geometry: { type: string; coordinates: any }; style?: Record<string, any> }[]
}

/**
 * Catches runtime errors from the Map component (e.g. WebGL context lost,
 * Mapbox GL initialization failures) and renders a static fallback.
 */
export default function MapErrorBoundary({ children, center, className, features }: Props) {
    return (
        <ErrorBoundary label="Map" fallback={<MapFallback center={center} className={className} features={features} />}>
            {children}
        </ErrorBoundary>
    )
}
