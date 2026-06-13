"use client"

import Header from '@/components/layout/Header';
import { useMapHeaderCity } from './MapHeaderContext';

/** The fullscreen-map header — adds the active municipality's logo + name when focused on one. */
export function MapPageHeader() {
    const { city } = useMapHeaderCity();
    const path = city
        ? [{
            name: city.name_municipality,
            link: `/${city.id}`,
            city: { name: city.name_municipality, logoImage: city.logoImage },
        }]
        : [];

    return (
        <Header
            path={path}
            className="relative z-50 shrink-0 border-b border-border bg-background"
            noContainer
        />
    );
}
