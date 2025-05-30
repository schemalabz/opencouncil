'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Search, X, Bell, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import Combobox from '@/components/Combobox';
import { CityWithGeometry } from '@/lib/db/cities';

interface MunicipalitySelectorProps {
    cities: CityWithGeometry[];
    hideQuickSelection?: boolean;
}

export function MunicipalitySelector({ cities: initialCities, hideQuickSelection = false }: MunicipalitySelectorProps) {
    const router = useRouter();
    const [selectedCity, setSelectedCity] = useState<CityWithGeometry | null>(null);
    const [allCities, setAllCities] = useState<CityWithGeometry[]>(initialCities);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch all municipalities when component mounts
    useEffect(() => {
        async function fetchCities() {
            try {
                setIsLoading(true);
                const response = await fetch('/api/cities?includeAll=true');
                if (!response.ok) {
                    throw new Error('Failed to fetch cities');
                }
                const data = await response.json();
                setAllCities(data);
            } catch (err) {
                setError('Υπήρξε πρόβλημα στη φόρτωση των δήμων');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }
        fetchCities();
    }, []);

    // Group cities
    const groups = [
        {
            key: 'supported',
            label: 'ΥΠΟΣΤΗΡΙΖΟΜΕΝΟΙ ΔΗΜΟΙ',
            items: allCities.filter(city => city.supportsNotifications),
            icon: Bell
        },
        {
            key: 'all',
            label: 'ΌΛΟΙ ΟΙ ΔΗΜΟΙ',
            items: allCities.filter(city => !city.supportsNotifications),
            icon: MapPin
        }
    ];

    // Custom trigger component
    const CityTrigger: React.ComponentType<{
        item: CityWithGeometry | null;
        placeholder: string;
        isOpen: boolean;
        onClear?: () => void;
    }> = ({ item, placeholder, isOpen }) => (
        <Button
            variant="outline"
            role="combobox"
            aria-expanded={isOpen}
            className={cn(
                "w-full justify-between h-12 sm:h-16 text-base sm:text-lg border-2 bg-white relative overflow-hidden group rounded-xl",
                item ? "border-orange-500" : "border-gray-200"
            )}
        >
            <div className="flex items-center gap-2 sm:gap-3">
                <div className={cn(
                    "flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full transition-colors",
                    item ? "bg-orange-100 text-orange-600" : "bg-gray-100 text-gray-500"
                )}>
                    <MapPin className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div className="text-left">
                    {item ? (
                        <div>
                            <div className="font-medium text-sm sm:text-base">{item.name}</div>
                            <div className="text-xs sm:text-sm text-gray-500">{item.name_municipality}</div>
                        </div>
                    ) : (
                        <div className="text-sm sm:text-base text-gray-500">{placeholder}</div>
                    )}
                </div>
            </div>
            <Search className={cn(
                "h-4 w-4 sm:h-5 sm:w-5 transition-colors",
                item ? "text-orange-500" : "text-gray-400"
            )} />
            <div className={cn(
                "absolute inset-0 bg-gradient-to-r opacity-0 transition-opacity duration-300 -z-10",
                item ? "from-orange-50 to-orange-100 opacity-100" : "",
                isOpen && !item ? "from-gray-50 to-gray-100 opacity-100" : ""
            )} />
        </Button>
    );

    // City item component
    const CityItem = ({ item }: { item: CityWithGeometry }) => (
        <div className="flex items-center">
            <div className={cn(
                "w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center mr-2",
                item.supportsNotifications ? "bg-orange-100" : "bg-gray-100"
            )}>
                {item.supportsNotifications ? (
                    <Bell className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                ) : (
                    <MapPin className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                )}
            </div>
            <div className="text-left">
                <div className="font-medium text-sm sm:text-base">{item.name}</div>
                <div className="text-[10px] sm:text-xs text-gray-500">{item.name_municipality}</div>
            </div>
        </div>
    );

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-6 bg-white/90 rounded-lg shadow-md space-y-4">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                <span className="text-center text-gray-700">Φόρτωση δήμων...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 bg-white/90 rounded-lg shadow-md">
                <div className="flex items-center text-red-500 mb-2">
                    <AlertTriangle className="w-5 h-5 mr-2" />
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

    return (
        <div className="space-y-6 w-full max-w-md mx-auto px-4 sm:px-0">
            <div>
                <Combobox
                    items={allCities}
                    value={selectedCity}
                    onChange={(city) => {
                        setSelectedCity(city);
                        if (city) {
                            if (city.isListed) {
                                router.push(`/${city.id}`);
                            } else {
                                router.push(`/${city.id}/petition`);
                            }
                        }
                    }}
                    placeholder="Επιλέξτε τον Δήμο σας..."
                    searchPlaceholder="Αναζητήστε τον Δήμο σας..."
                    groups={groups}
                    ItemComponent={CityItem}
                    TriggerComponent={CityTrigger}
                    getItemLabel={(city) => city.name}
                    getItemValue={(city) => `${city.name} ${city.name_municipality}`}
                    clearable
                    loading={isLoading}
                    emptyMessage="Δεν βρέθηκε Δήμος με αυτό το όνομα."
                />

                {/* Quick Selection for Listed Cities */}
                {!hideQuickSelection && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3, duration: 0.5 }}
                        className="flex flex-wrap justify-center gap-2 mt-4"
                    >
                        {allCities
                            .filter(city => city.isListed)
                            .slice(0, 5)
                            .map((city) => (
                                <motion.div
                                    key={city.id}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <Button
                                        variant="outline"
                                        className="bg-white border-gray-200 hover:border-orange-300 hover:bg-orange-50 rounded-xl"
                                        onClick={() => {
                                            setSelectedCity(city);
                                            if (city.isListed) {
                                                router.push(`/${city.id}`);
                                            } else {
                                                router.push(`/${city.id}/petition`);
                                            }
                                        }}
                                    >
                                        {city.name}
                                    </Button>
                                </motion.div>
                            ))}
                    </motion.div>
                )}

                {/* Decorative elements */}
                <div className="absolute -z-10 -top-6 -left-6 w-12 h-12 rounded-full bg-orange-100 opacity-50" />
                <div className="absolute -z-10 -bottom-4 -right-4 w-8 h-8 rounded-full bg-orange-200 opacity-40" />
            </div>
        </div>
    );
} 