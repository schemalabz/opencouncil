'use client';

import { useState } from 'react';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import Map, { type MapFeature } from '@/components/map/map';
import { coverageCities, platformStats } from './mockData';

// Default map view (centered on Greece).
const MAP_CENTER: [number, number] = [23.8, 38.9];
const MAP_ZOOM = 5.4;

/**
 * Coverage band — the real Mapbox map (via the app's <Map> component) centered on
 * Greece, with covered cities as point markers, and the "not covered yet" →
 * petition path beside it. <Map> degrades to a static fallback if WebGL or the
 * Mapbox token is unavailable.
 */

// Covered cities as point features for the map.
const coverageFeatures: MapFeature[] = coverageCities.map((c) => ({
    id: c.id,
    geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
    properties: { name: c.name },
    style: { fillColor: '#fc550a', strokeColor: '#ffffff', strokeWidth: 2, label: c.name },
}));

export function CoverageBand() {
    // Remounting the map (via key) resets the view to the default center/zoom,
    // since <Map> stops honoring center/zoom props once the user pans.
    const [mapKey, setMapKey] = useState(0);
    const resetMap = () => setMapKey((k) => k + 1);

    return (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="relative min-h-[560px] overflow-hidden rounded-3xl border border-border sm:min-h-[760px] lg:col-span-8">
                <Map
                    key={mapKey}
                    className="absolute inset-0 h-full w-full"
                    center={MAP_CENTER}
                    zoom={MAP_ZOOM}
                    pitch={0}
                    animateRotation={false}
                    features={coverageFeatures}
                />

                {/* Floating reset button */}
                <button
                    type="button"
                    onClick={resetMap}
                    aria-label="Επαναφορά χάρτη"
                    title="Επαναφορά χάρτη"
                    className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
                >
                    <RotateCcw className="h-4 w-4" />
                </button>

                {/* Content overlay with a bottom scrim for legibility over the map */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/85 to-transparent p-6 sm:p-8">
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                        {platformStats.citiesCount} δήμοι, σε όλη την Ελλάδα
                    </h2>
                    <p className="mt-2 max-w-md text-muted-foreground">
                        Ο χάρτης δείχνει πού λειτουργεί ήδη το OpenCouncil. Διαρκώς προστίθενται νέοι.
                    </p>
                    <Button asChild variant="outline" className="pointer-events-auto mt-4 rounded-full bg-background">
                        <Link href="/map">
                            Άνοιγμα χάρτη
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Uncovered-city → petition path */}
            <div className="flex flex-col justify-between gap-6 rounded-3xl bg-primary p-6 text-primary-foreground sm:p-8 lg:col-span-4">
                <div className="space-y-3">
                    <h3 className="text-xl font-semibold">Δεν βλέπεις τον δήμο σου;</h3>
                    <p className="text-primary-foreground/75">
                        Ζήτησέ τον. Όταν μαζευτεί αρκετό ενδιαφέρον από πολίτες, τον φέρνουμε στο OpenCouncil.
                    </p>
                </div>
                <Button
                    asChild
                    size="lg"
                    className="rounded-full bg-[hsl(var(--orange))] text-white hover:bg-[hsl(var(--orange))]/90"
                >
                    <Link href="/petition">Ζήτησε τον δήμο σου</Link>
                </Button>
            </div>
        </section>
    );
}
