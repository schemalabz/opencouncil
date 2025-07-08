'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MunicipalitySelector } from '@/components/onboarding/selectors/MunicipalitySelector';
import { CityMinimalWithCounts } from '@/lib/db/cities';

interface PetitionMunicipalitySelectorProps {
    cities: CityMinimalWithCounts[];
}

export function PetitionMunicipalitySelector({ cities }: PetitionMunicipalitySelectorProps) {
    const router = useRouter();
    const [selectedCity, setSelectedCity] = useState<CityMinimalWithCounts | null>(null);
    const [isNavigating, setIsNavigating] = useState(false);

    const handleCitySelect = (city: CityMinimalWithCounts | null) => {
        if (!city) {
            setSelectedCity(null);
            return;
        }

        setSelectedCity(city);
        setIsNavigating(true);

        const targetUrl = !city.isListed ? `/${city.id}/petition` : `/${city.id}`;

        // Force a proper history entry by ensuring the browser processes this as a user action
        setTimeout(() => {
            router.push(targetUrl);
        }, 0);
    };

    return (
        <MunicipalitySelector
            cities={cities}
            value={selectedCity}
            onCitySelect={handleCitySelect}
            isNavigating={isNavigating}
            hideQuickSelection
        />
    );
} 