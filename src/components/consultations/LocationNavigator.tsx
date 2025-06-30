'use client';

import { useState, useEffect } from 'react';
import { LocationSelector } from '@/components/onboarding/selectors/LocationSelector';
import { Location } from '@/lib/types/onboarding';
import { CityWithGeometry } from '@/lib/db/cities';

interface LocationNavigatorProps {
    city: CityWithGeometry;
    onNavigateToLocation: (coordinates: [number, number]) => void;
    onSelectedLocationsChange?: (locations: Location[]) => void;
}

export function LocationNavigator({ city, onNavigateToLocation, onSelectedLocationsChange }: LocationNavigatorProps) {
    const [selectedLocations, setSelectedLocations] = useState<Location[]>([]);

    // Notify parent whenever selectedLocations changes
    useEffect(() => {
        onSelectedLocationsChange?.(selectedLocations);
    }, [selectedLocations, onSelectedLocationsChange]);

    const handleLocationSelect = (location: Location) => {
        // Add to selected locations list
        const newLocations = [...selectedLocations, location];
        setSelectedLocations(newLocations);
        
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
                {selectedLocations.length === 1 && (
                    <div className="mt-1 text-green-600 font-medium">
                        📍 Εμφανίζεται μεγάλο σημείο για την επιλεγμένη τοποθεσία
                    </div>
                )}
                {selectedLocations.length > 1 && (
                    <div className="mt-1 text-blue-600 font-medium">
                        🔗 Γραμμές συνδέονται μεταξύ {selectedLocations.length} επιλεγμένων τοποθεσιών
                    </div>
                )}
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