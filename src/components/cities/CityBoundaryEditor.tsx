"use client"
import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Textarea } from '@/components/ui/textarea'
import Map, { MapFeature } from '@/components/map/map'
import { parseBoundaryInput, type BoundaryParseError } from '@/lib/utils/geojson'

type Boundary = GeoJSON.Polygon | GeoJSON.MultiPolygon

interface CityBoundaryEditorProps {
    /** Set in edit mode — used to fetch the currently stored boundary for preview. */
    cityId?: string
    /** Fires with the parsed boundary when a valid paste exists, null otherwise. */
    onBoundaryChange: (geometry: Boundary | null) => void
}

/**
 * Paste-and-preview editor for a city's boundary polygon. Accepts GeoJSON in
 * the shapes people actually copy out of tools (bare geometry, Feature,
 * FeatureCollection — see `parseBoundaryInput`) and previews it on the map
 * next to nothing-yet/stored-boundary states. The parsed geometry is only
 * handed up to CityForm; persisting happens on form submit.
 */
export default function CityBoundaryEditor({ cityId, onBoundaryChange }: CityBoundaryEditorProps) {
    const t = useTranslations('CityForm')
    const [input, setInput] = useState('')
    const [pasted, setPasted] = useState<Boundary | null>(null)
    const [error, setError] = useState<BoundaryParseError | null>(null)
    const [stored, setStored] = useState<Boundary | null>(null)

    // The stored boundary is not part of the City payload the form receives
    // (geometry is fetched separately everywhere) — load it once for preview.
    useEffect(() => {
        if (!cityId) return
        let cancelled = false
        fetch(`/api/cities/${cityId}`)
            .then(res => (res.ok ? res.json() : null))
            .then(city => {
                if (cancelled || !city?.geometry) return
                if (city.geometry.type === 'Polygon' || city.geometry.type === 'MultiPolygon') {
                    setStored(city.geometry as Boundary)
                }
            })
            .catch(err => console.error('Failed to fetch city boundary:', err))
        return () => {
            cancelled = true
        }
    }, [cityId])

    const handleChange = (value: string) => {
        setInput(value)
        if (value.trim() === '') {
            setPasted(null)
            setError(null)
            onBoundaryChange(null)
            return
        }
        const result = parseBoundaryInput(value)
        if (result.ok) {
            setPasted(result.geometry)
            setError(null)
            onBoundaryChange(result.geometry)
        } else {
            setPasted(null)
            setError(result.error)
            onBoundaryChange(null)
        }
    }

    const shown = pasted ?? stored
    const features = useMemo<MapFeature[]>(() => {
        if (!shown) return []
        return [{
            id: 'city-boundary',
            geometry: shown,
            style: pasted
                ? { fillColor: '#6366F1', fillOpacity: 0.25, strokeColor: '#4338CA', strokeWidth: 2 }
                : { fillColor: '#9CA3AF', fillOpacity: 0.2, strokeColor: '#4B5563', strokeWidth: 2 },
        }]
    }, [shown, pasted])

    const statusText = error
        ? t(`boundaryError_${error}`)
        : pasted
            ? t('boundaryPreviewingPasted')
            : stored
                ? t('boundaryShowingStored')
                : t('boundaryNoneStored')

    return (
        <div className="space-y-2">
            <Textarea
                value={input}
                onChange={(e) => handleChange(e.target.value)}
                placeholder={t('boundaryPlaceholder')}
                className="font-mono text-xs min-h-[6rem]"
                spellCheck={false}
            />
            <p className={error ? 'text-sm font-medium text-destructive' : 'text-sm text-muted-foreground'}>
                {statusText}
            </p>
            {shown && (
                <div className="h-64 rounded-md overflow-hidden border">
                    <Map
                        features={features}
                        zoomToGeometry={shown}
                        animateRotation={false}
                        pitch={0}
                        cooperativeGestures
                    />
                </div>
            )}
        </div>
    )
}
