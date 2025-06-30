'use client';

import { useState } from 'react';
import { LocationSelector } from '@/components/onboarding/selectors/LocationSelector';
import { Location } from '@/lib/types/onboarding';
import { CityWithGeometry } from '@/lib/db/cities';

interface LocationNavigatorProps {
    city: CityWithGeometry;
    onNavigateToLocation: (coordinates: [number, number]) => void;
}

export function LocationNavigator({ city, onNavigateToLocation }: LocationNavigatorProps) {
    const [selectedLocations, setSelectedLocations] = useState<Location[]>([]);

    const handleLocationSelect = (location: Location) => {
        // Add to selected locations list
        setSelectedLocations(prev => [...prev, location]);
        
        // Also immediately navigate to it
        onNavigateToLocation(location.coordinates);
        console.log('🗺️ Navigating to location:', location.text, location.coordinates);
    };

    const handleLocationRemove = (index: number) => {
        const newLocations = selectedLocations.filter((_, i) => i !== index);
        setSelectedLocations(newLocations);
    };

    const handleLocationClick = (location: Location) => {
        // Navigate to clicked location
        onNavigateToLocation(location.coordinates);
        console.log('🗺️ Re-navigating to location:', location.text, location.coordinates);
    };

    return (
        <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
                Αναζητήστε διευθύνσεις για πλοήγηση στον χάρτη. Κάντε κλικ σε επιλεγμένες τοποθεσίες για επαναφορά.
            </div>
            <LocationSelector
                selectedLocations={selectedLocations}
                onSelect={handleLocationSelect}
                onRemove={handleLocationRemove}
                city={city}
                onLocationClick={handleLocationClick}
            />
        </div>
    );
} 