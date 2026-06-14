"use client"

import { createContext, useContext, useState, type ReactNode } from 'react';

export interface MapHeaderCity {
    id: string;
    /** Short city name («Αθήνα»), matching the city-page header — not «Δήμος Αθηναίων». */
    name: string;
    logoImage: string | null;
}

interface MapHeaderContextValue {
    city: MapHeaderCity | null;
    setCity: (city: MapHeaderCity | null) => void;
}

const MapHeaderContext = createContext<MapHeaderContextValue | null>(null);

/**
 * Lets the client map view drive the layout header — when the map is focused
 * on a single municipality, the page header shows that city's logo + name
 * (the same treatment as a city page).
 */
export function MapHeaderProvider({ children }: { children: ReactNode }) {
    const [city, setCity] = useState<MapHeaderCity | null>(null);
    return <MapHeaderContext.Provider value={{ city, setCity }}>{children}</MapHeaderContext.Provider>;
}

export function useMapHeaderCity(): MapHeaderContextValue {
    return useContext(MapHeaderContext) ?? { city: null, setCity: () => undefined };
}
