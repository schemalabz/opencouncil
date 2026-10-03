'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Maximize2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { env } from '@/env.mjs';
import type { MapFeature } from '@/components/map/map';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { CityWithGeometry } from '@/lib/db/cities';
import { calculateMapView } from '@/lib/geo';
import { STATIC_MAP_STYLE, staticMapOverlayUrl, type StaticMapFeature, type StaticMapPosition } from '@/lib/map/staticMap';
import { getRealmDefaultMapView } from '@/lib/realm';
import type { Location } from '@/lib/types/onboarding';
import { cn } from '@/lib/utils';

/** The municipality as both maps draw it: a light wash inside a blue outline. */
const CITY_OUTLINE_STYLE = { fillColor: '#627BBC', fillOpacity: 0.15, strokeColor: '#4263EB', strokeWidth: 2 };
const PLACE_COLOR = '#ff6600';

/**
 * Where the static map looks. With no place, at the whole municipality. With
 * one, at the neighbourhood around it: fitting a single pin zooms to the
 * building. With several, at the box around them.
 */
function framing(points: Location[], panel: boolean): StaticMapPosition {
    if (points.length === 0) return 'auto';
    const lngs = points.map((l) => l.coordinates[0]);
    const lats = points.map((l) => l.coordinates[1]);
    const box: [number, number, number, number] = [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
    // Places a few metres apart make a box with no area; frame them as one.
    if (points.length === 1 || (box[2] - box[0] < 0.002 && box[3] - box[1] < 0.002)) {
        return { center: [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], zoom: panel ? 13.5 : 14 };
    }
    return { bbox: box };
}

// The one dynamic import the signup allows (decision of 2026-09-06): the
// map library is the heaviest thing on the page and only the sheet needs
// it, so a reader who never opens the sheet never downloads it.
const Map = dynamic(() => import('@/components/map/map'), {
    ssr: false,
    loading: () => (
        <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
    ),
});

/**
 * The map, quietly: a static image of the municipality and the chosen
 * places, and the full map only on request. The old signup was a map with
 * a form floating over it; the places matter, the map is context.
 *
 * Both draw the municipality's outline, as the full map does, so the reader
 * sees where the δήμος ends. The strip sits under the address search on a
 * phone. The panel is the desktop's aside. With an `emptyLabel`, both show the municipality before
 * there is a place, with the label over it: the map is the empty state, an
 * invitation rather than a blank. Without one, the strip shows nothing until
 * there is a place, and the panel shows the municipality alone (the
 * petition).
 */
export function LocationPreview({
    city,
    locations,
    variant = 'strip',
    emptyLabel,
    className,
}: {
    city: CityWithGeometry;
    locations: Location[];
    variant?: 'strip' | 'panel';
    /** What the map says while there is no place yet; nothing when omitted. */
    emptyLabel?: string;
    className?: string;
}) {
    const t = useTranslations('signup');
    const [open, setOpen] = useState(false);
    const panel = variant === 'panel';

    const points = locations.filter((l) => Number.isFinite(l.coordinates[0]) && Number.isFinite(l.coordinates[1]));
    const [width, height] = panel ? [720, 840] : [600, 280];
    let src: string | null = null;
    if (points.length > 0 || panel || emptyLabel) {
        // The municipality's outline under the places, as the full map draws it.
        const outline: StaticMapFeature[] = city.geometry ? [{ geometry: city.geometry, style: CITY_OUTLINE_STYLE }] : [];
        const pins: StaticMapFeature[] = points.map((l) => ({
            geometry: { type: 'Point', coordinates: l.coordinates },
            style: { fillColor: PLACE_COLOR },
        }));
        const position = framing(points, panel);
        // A pin stands above its point, so a box of places needs more room than the outline.
        const padding = position === 'auto' ? (panel ? 40 : 16) : panel ? 80 : 48;
        // An outline too detailed for the URL even when thinned costs the outline,
        // never the reader's places.
        src =
            staticMapOverlayUrl({ features: [...outline, ...pins], position, width, height, padding }) ??
            staticMapOverlayUrl({ features: pins, position, width, height, padding });
    }
    if (!src && (panel || emptyLabel)) {
        const view = getRealmDefaultMapView(city.realm);
        src = `https://api.mapbox.com/styles/v1/${STATIC_MAP_STYLE}/static/${view.center[0]},${view.center[1]},${view.zoom.toFixed(2)},0/${width}x${height}@2x?access_token=${env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}`;
    }

    if (!src) return null;

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={cn(
                    'relative block w-full overflow-hidden border border-border bg-muted',
                    panel ? 'h-[420px] rounded-[14px]' : 'h-[140px] rounded-[10px]',
                    className,
                )}
                aria-label={t('map.open')}
            >
                {/* A static image, not a map: nothing to drag, nothing to load. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
                {emptyLabel && points.length === 0 && (
                    <span className="absolute left-2.5 top-2.5 max-w-[calc(100%-1.25rem)] rounded-[10px] border border-border bg-card/95 px-2.5 py-1.5 text-left text-xs leading-snug text-foreground shadow-sm">
                        {emptyLabel}
                    </span>
                )}
                <span className="absolute bottom-2 right-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs text-foreground shadow-sm">
                    <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    {t('map.open')}
                </span>
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-2xl p-0">
                    <DialogTitle className="px-4 pt-4 text-base">{t('map.title')}</DialogTitle>
                    {open && <FullMap city={city} locations={locations} />}
                </DialogContent>
            </Dialog>
        </>
    );
}

function FullMap({ city, locations }: { city: CityWithGeometry; locations: Location[] }) {
    const features = useMemo<MapFeature[]>(() => {
        const cityFeature: MapFeature[] = city.geometry
            ? [{ id: city.id, geometry: city.geometry, style: CITY_OUTLINE_STYLE }]
            : [];
        const points = locations.map((l, i) => ({
            id: `location-${i}`,
            geometry: { type: 'Point', coordinates: l.coordinates },
            style: { fillColor: PLACE_COLOR, fillOpacity: 0.9, strokeColor: '#c24e00', strokeWidth: 6, label: l.text },
        }));
        return [...cityFeature, ...points];
    }, [city, locations]);

    const view = city.geometry ? calculateMapView(city.geometry) : getRealmDefaultMapView(city.realm);
    const zoomTarget: GeoJSON.Geometry | undefined =
        locations.length > 0
            ? {
                  type: 'GeometryCollection',
                  geometries: locations.map((l) => ({ type: 'Point' as const, coordinates: l.coordinates })),
              }
            : undefined;

    return (
        <div className="h-[60vh] w-full">
            <Map
                features={features}
                center={view.center}
                zoom={view.zoom}
                animateRotation={false}
                pitch={0}
                zoomToGeometry={zoomTarget}
                zoomPadding={80}
                className="h-full w-full"
            />
        </div>
    );
}
