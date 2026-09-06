'use client';

import { useMemo, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { env } from '@/env.mjs';
import Map, { type MapFeature } from '@/components/map/map';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { CityWithGeometry } from '@/lib/db/cities';
import { calculateMapView } from '@/lib/geo';
import { getRealmDefaultMapView } from '@/lib/realm';
import type { Location } from '@/lib/types/onboarding';
import { cn } from '@/lib/utils';

const STATIC_STYLE = 'https://api.mapbox.com/styles/v1/mapbox/light-v11/static';

/**
 * The map, quietly: a static image of the chosen places, and the full map
 * only on request. The old signup was a map with a form floating over it;
 * the places matter, the map is context.
 *
 * The strip sits under the address search on a phone and shows nothing
 * until there is a place to show. The panel is the desktop's aside: it
 * shows the municipality from the start, and the places as they are added.
 */
export function LocationPreview({
    city,
    locations,
    variant = 'strip',
    className,
}: {
    city: CityWithGeometry;
    locations: Location[];
    variant?: 'strip' | 'panel';
    className?: string;
}) {
    const t = useTranslations('notificationSignup');
    const [open, setOpen] = useState(false);
    const panel = variant === 'panel';

    const pins = locations
        .filter((l) => Number.isFinite(l.coordinates[0]) && Number.isFinite(l.coordinates[1]))
        .map((l) => `pin-s+ff6600(${l.coordinates[0]},${l.coordinates[1]})`)
        .join(',');
    const size = panel ? '720x840' : '600x240';
    let src: string | null = null;
    if (pins) {
        src = `${STATIC_STYLE}/${pins}/auto/${size}@2x?padding=${panel ? 80 : 48}&access_token=${env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}`;
    } else if (panel) {
        const view = city.geometry ? calculateMapView(city.geometry) : getRealmDefaultMapView(city.realm);
        src = `${STATIC_STYLE}/${view.center[0]},${view.center[1]},${view.zoom.toFixed(2)},0/${size}@2x?access_token=${env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}`;
    }

    if (!src) return null;

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={cn(
                    'relative block w-full overflow-hidden border border-border bg-muted',
                    panel ? 'h-[420px] rounded-[14px]' : 'h-[120px] rounded-[10px]',
                    className,
                )}
                aria-label={t('openMap')}
            >
                {/* A static image, not a map: nothing to drag, nothing to load. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
                {panel && locations.length === 0 && (
                    <span className="absolute left-3 top-3 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                        {t('mapEmpty')}
                    </span>
                )}
                <span className="absolute bottom-2 right-2 inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs text-foreground shadow-sm">
                    <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    {t('openMap')}
                </span>
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-2xl p-0">
                    <DialogTitle className="px-4 pt-4 text-base">{t('mapTitle')}</DialogTitle>
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
