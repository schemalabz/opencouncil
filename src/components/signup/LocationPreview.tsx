'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Maximize2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { env } from '@/env.mjs';
import type { MapFeature } from '@/components/map/map';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { CityWithGeometry } from '@/lib/db/cities';
import { calculateGeometryBounds, calculateMapView } from '@/lib/geo';
import { getRealmDefaultMapView } from '@/lib/realm';
import type { Location } from '@/lib/types/onboarding';
import { cn } from '@/lib/utils';

const STATIC_STYLE = 'https://api.mapbox.com/styles/v1/mapbox/light-v11/static';

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
 * The strip sits under the address search on a phone. The panel is the
 * desktop's aside. With an `emptyLabel`, both show the municipality before
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
    const pins = points.map((l) => `pin-s+ff6600(${l.coordinates[0]},${l.coordinates[1]})`).join(',');
    const size = panel ? '720x840' : '600x280';
    let src: string | null = null;
    if (points.length === 1) {
        // `auto` around a single pin zooms to the building; a neighbourhood around it is the context.
        const [lng, lat] = points[0].coordinates;
        src = `${STATIC_STYLE}/${pins}/${lng},${lat},${panel ? 13.5 : 14},0/${size}@2x?access_token=${env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}`;
    } else if (pins) {
        src = `${STATIC_STYLE}/${pins}/auto/${size}@2x?padding=${panel ? 80 : 48}&access_token=${env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}`;
    } else if (panel || emptyLabel) {
        // Framed on the municipality's own bounds: a centre and a zoom fit no
        // single frame, and showed a whole region around a small δήμος.
        const bounds = city.geometry ? calculateGeometryBounds(city.geometry).bounds : null;
        if (bounds) {
            const bbox = [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat].map((n) => n.toFixed(5)).join(',');
            src = `${STATIC_STYLE}/[${bbox}]/${size}@2x?padding=${panel ? 40 : 16}&access_token=${env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}`;
        } else {
            const view = getRealmDefaultMapView(city.realm);
            src = `${STATIC_STYLE}/${view.center[0]},${view.center[1]},${view.zoom.toFixed(2)},0/${size}@2x?access_token=${env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}`;
        }
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
                {emptyLabel && !pins && (
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
            ? [{ id: city.id, geometry: city.geometry, style: { fillColor: '#627BBC', fillOpacity: 0.15, strokeColor: '#4263EB', strokeWidth: 2 } }]
            : [];
        const points = locations.map((l, i) => ({
            id: `location-${i}`,
            geometry: { type: 'Point', coordinates: l.coordinates },
            style: { fillColor: '#ff6600', fillOpacity: 0.9, strokeColor: '#c24e00', strokeWidth: 6, label: l.text },
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
