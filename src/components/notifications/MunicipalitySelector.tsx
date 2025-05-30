'use client';

import { useState, useEffect } from 'react';
import Combobox from '@/components/Combobox';
import { Loader2, Bell, InfoIcon, Search, AlertTriangle } from 'lucide-react';
import { City } from '@prisma/client';
import { cn, normalizeText } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

interface MunicipalitySelectorProps {
    onSelect: (city: City & { geometry?: any }) => void;
}

export function MunicipalitySelector({ onSelect }: MunicipalitySelectorProps) {
    const [allCities, setAllCities] = useState<(City & { geometry?: any })[]>([]);
    const [supportedCities, setSupportedCities] = useState<(City & { geometry?: any })[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredCities, setFilteredCities] = useState<(City & { geometry?: any })[]>([]);
    const [filteredUnsupportedCities, setFilteredUnsupportedCities] = useState<(City & { geometry?: any })[]>([]);

    // Fetch all municipalities when component mounts
    useEffect(() => {
        async function fetchCities() {
            try {
                // This will fetch ALL cities (both supported and unsupported)
                const response = await fetch('/api/cities?includeAll=true');

                if (!response.ok) {
                    throw new Error('Failed to fetch cities');
                }

                const data = await response.json();

                // Store all cities for searching
                setAllCities(data);

                // Filter out just the supported cities for display in the default list
                const supported = data.filter((city: City) =>
                    city.supportsNotifications && city.isListed && !city.isPending
                );
                setSupportedCities(supported);
                setFilteredCities(supported);
            } catch (err) {
                setError('Υπήρξε πρόβλημα στη φόρτωση των δήμων');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }

        fetchCities();
    }, []);

    // Filter cities when search query changes
    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredCities(supportedCities);
            setFilteredUnsupportedCities([]);
            return;
        }

        const normalizedQuery = normalizeText(searchQuery.trim());

        // Search through ALL cities with normalized text for accent-insensitive matching
        const matchedCities = allCities.filter(city =>
            normalizeText(city.name).includes(normalizedQuery) ||
            normalizeText(city.name_municipality).includes(normalizedQuery)
        );

        // Split the results into supported and unsupported
        const supported = matchedCities.filter(city =>
            city.supportsNotifications && city.isListed && !city.isPending
        );

        const unsupported = matchedCities.filter(city =>
            !city.supportsNotifications || !city.isListed || city.isPending
        );

        setFilteredCities(supported);
        setFilteredUnsupportedCities(unsupported);
    }, [searchQuery, allCities, supportedCities]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-6 bg-white/90 rounded-lg shadow-md space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="text-center text-gray-700">Φόρτωση δήμων...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 bg-white/90 rounded-lg shadow-md">
                <div className="flex items-center text-red-500 mb-2">
                    <InfoIcon className="w-5 h-5 mr-2" />
                    <span className="font-medium">Σφάλμα</span>
                </div>
                <p className="mb-4 text-red-600">{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="w-full px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
                >
                    Δοκιμάστε ξανά
                </button>
            </div>
        );
    }

    // Handler for selection
    const handleCityClick = (city: City & { geometry?: any }) => {
        setSelectedCityId(city.id);
        // Fetch geometry data
        fetch(`/api/cities/${city.id}`)
            .then(response => {
                if (response.ok) return response.json();
                return city; // Fallback to the city without geometry
            })
            .then(cityData => {
                const fullCity = {
                    ...city,
                    ...cityData
                };
                onSelect(fullCity);
            })
            .catch(error => {
                console.error('Error fetching city data:', error);
                onSelect(city);
            });
    };

    const supportedCitiesCount = supportedCities.length;
    const totalCitiesCount = allCities.length;

    return (
        <div className="w-full max-w-md space-y-5">
            <div>
                <h2 className="text-2xl font-bold mb-2">Επιλέξτε τον δήμο σας</h2>
                <p className="text-gray-600 text-sm">
                    Για να λαμβάνετε ενημερώσεις για τα θέματα που συζητιούνται στο δημοτικό συμβούλιο
                </p>
            </div>

            <div className="relative">
                <div className="relative mb-4">
                    <Input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Αναζητήστε δήμο..."
                        className="pr-10"
                    />
                    <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>

                <div className="max-h-60 overflow-y-auto rounded-md border border-input bg-white shadow-sm">
                    {filteredCities.length === 0 && filteredUnsupportedCities.length === 0 ? (
                        <div className="py-6 text-center text-sm text-gray-500">
                            Δεν βρέθηκαν αποτελέσματα
                        </div>
                    ) : (
                        <div>
                            {/* Supported municipalities */}
                            {filteredCities.length > 0 && (
                                <ul className="p-0 m-0">
                                    {filteredCities.map((city) => (
                                        <li
                                            key={city.id}
                                            className={cn(
                                                "px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-100",
                                                selectedCityId === city.id && "bg-primary/10"
                                            )}
                                            onClick={() => handleCityClick(city)}
                                        >
                                            <div>
                                                <div className="font-medium">{city.name}</div>
                                                <div className="text-xs text-gray-500">{city.name_municipality}</div>
                                            </div>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Badge variant="secondary" className="ml-2 flex items-center gap-1">
                                                            <Bell className="h-3 w-3" />
                                                            <span className="text-xs">Υποστηρίζεται</span>
                                                        </Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>Αυτός ο δήμος υποστηρίζει ενημερώσεις</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {/* Show unsupported municipalities if they match the search */}
                            {filteredUnsupportedCities.length > 0 && (
                                <>
                                    {filteredCities.length > 0 && <Separator className="my-2" />}
                                    <div className="px-3 py-2">
                                        <div className="flex items-center gap-2 text-xs text-green-600 font-medium mb-2">
                                            <AlertTriangle className="h-3 w-3" />
                                            <span>Μπορείτε να ζητήσετε από τους παρακάτω δήμους να συμμετάσχουν στο OpenCouncil</span>
                                        </div>
                                        <ul className="p-0 m-0">
                                            {filteredUnsupportedCities.slice(0, 3).map((city) => (
                                                <li
                                                    key={city.id}
                                                    className={cn(
                                                        "px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-100 rounded-md border border-amber-100 mb-2 bg-amber-50",
                                                        selectedCityId === city.id && "bg-amber-100"
                                                    )}
                                                    onClick={() => handleCityClick(city)}
                                                >
                                                    <div>
                                                        <div className="font-medium">{city.name}</div>
                                                        <div className="text-xs text-gray-500">{city.name_municipality}</div>
                                                    </div>
                                                    {city.isPending && (
                                                        <Badge variant="outline" className="ml-2 bg-amber-50 border-amber-200 text-amber-700">
                                                            <span className="text-xs">Δεν υποστηρίζεται</span>
                                                        </Badge>
                                                    )}
                                                </li>
                                            ))}
                                            {filteredUnsupportedCities.length > 3 && (
                                                <div className="text-xs text-gray-500 text-center mt-1">
                                                    + {filteredUnsupportedCities.length - 3} ακόμα δήμοι
                                                </div>
                                            )}
                                        </ul>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
} 