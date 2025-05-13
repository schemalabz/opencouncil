'use client';

import { useState, useEffect } from 'react';
import Combobox from '@/components/Combobox';
import { Loader2 } from 'lucide-react';

// Define type that matches the Prisma schema and SignupPageContent.tsx
type City = {
    id: string;
    name: string;
    name_en: string;
    name_municipality: string;
    name_municipality_en: string;
    logoImage: string | null;
    timezone: string;
    createdAt?: Date;
    updatedAt?: Date;
    officialSupport: boolean;
    isListed?: boolean;
    isPending?: boolean;
    authorityType?: string;
    wikipediaId?: string | null;
    geometry?: any;
    supportsNotifications: boolean;
};

interface MunicipalitySelectorProps {
    onSelect: (city: City) => void;
}

export function MunicipalitySelector({ onSelect }: MunicipalitySelectorProps) {
    const [cities, setCities] = useState<City[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCityId, setSelectedCityId] = useState<string | null>(null);

    // Fetch all municipalities when component mounts
    useEffect(() => {
        async function fetchCities() {
            try {
                const response = await fetch('/api/cities');

                if (!response.ok) {
                    throw new Error('Failed to fetch cities');
                }

                const data = await response.json();

                // Ensure each city has the required fields
                const citiesWithRequiredFields = data.map((city: any) => ({
                    id: city.id,
                    name: city.name,
                    name_en: city.name_en,
                    name_municipality: city.name_municipality || "",
                    name_municipality_en: city.name_municipality_en || "",
                    logoImage: city.logoImage,
                    timezone: city.timezone || "Europe/Athens",
                    createdAt: city.createdAt,
                    updatedAt: city.updatedAt,
                    officialSupport: city.officialSupport || false,
                    isListed: city.isListed,
                    isPending: city.isPending,
                    authorityType: city.authorityType,
                    wikipediaId: city.wikipediaId,
                    geometry: city.geometry,
                    // Use the field from the database or default to false
                    supportsNotifications: city.supportsNotifications ?? false
                }));

                setCities(citiesWithRequiredFields);
            } catch (err) {
                setError('Υπήρξε πρόβλημα στη φόρτωση των δήμων');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }

        fetchCities();
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-6 bg-white/80 backdrop-blur-sm rounded-lg shadow-md">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span>Φόρτωση δήμων...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 bg-white/80 backdrop-blur-sm rounded-lg shadow-md">
                <p className="text-red-500">{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-4 px-4 py-2 bg-primary text-white rounded-md"
                >
                    Δοκιμάστε ξανά
                </button>
            </div>
        );
    }

    // Create options for combobox - just the city names
    const options = cities.map(city => city.name);

    // Handler for combobox selection
    const handleSelection = async (cityName: string | null) => {
        if (cityName) {
            const selectedCity = cities.find(city => city.name === cityName);
            if (selectedCity) {
                try {
                    // Fetch the full city data including geometry
                    const response = await fetch(`/api/cities/${selectedCity.id}`);
                    if (response.ok) {
                        const cityWithGeometry = await response.json();
                        console.log('Fetched city with geometry:', cityWithGeometry);

                        // Combine the data
                        const fullCity = {
                            ...selectedCity,
                            ...cityWithGeometry
                        };

                        setSelectedCityId(fullCity.id);
                        onSelect(fullCity);
                    } else {
                        // Fallback to the city without geometry if fetch fails
                        setSelectedCityId(selectedCity.id);
                        onSelect(selectedCity);
                    }
                } catch (error) {
                    console.error('Error fetching city data:', error);
                    setSelectedCityId(selectedCity.id);
                    onSelect(selectedCity);
                }
            }
        }
    };

    return (
        <div className="w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Επιλέξτε τον δήμο σας</h2>
            <p className="mb-4 text-sm text-gray-700">
                Για να λαμβάνετε ενημερώσεις για τα θέματα που συζητιούνται στο δημοτικό συμβούλιο
            </p>

            <Combobox
                options={options}
                value={selectedCityId ? cities.find(city => city.id === selectedCityId)?.name || null : null}
                onChange={handleSelection}
                placeholder="Αναζητήστε δήμο..."
                className="w-full"
            />
        </div>
    );
} 