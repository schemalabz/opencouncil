'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Search, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import Combobox from '@/components/Combobox';
import { CityMinimalWithCounts } from '@/lib/db/cities';

interface MunicipalitySelectorProps {
    cities: CityMinimalWithCounts[];
    hideQuickSelection?: boolean;
}

export function MunicipalitySelector({ cities, hideQuickSelection = false }: MunicipalitySelectorProps) {
    const router = useRouter();
    const [selectedCity, setSelectedCity] = useState<CityMinimalWithCounts | null>(null);
    const [isNavigating, setIsNavigating] = useState(false);

    // Group cities
    const groups = [
        {
            key: 'supported',
            label: 'ΥΠΟΣΤΗΡΙΖΟΜΕΝΟΙ ΔΗΜΟΙ',
            items: cities.filter(city => city.isListed),
            icon: MapPin
        },
        {
            key: 'all',
            label: 'ΌΛΟΙ ΟΙ ΔΗΜΟΙ',
            items: cities.filter(city => !city.isListed),
            icon: MapPin
        }
    ];

    // Custom trigger component
    const CityTrigger: React.ComponentType<{
        item: CityMinimalWithCounts | null;
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
                {item ? (
                    <div className="text-left">
                        <div className="font-medium text-sm sm:text-base">{item.name}</div>
                        <div className="text-xs sm:text-sm text-gray-500">{item.name_municipality}</div>
                    </div>
                ) : (
                    <div className="text-sm sm:text-base text-gray-500">{placeholder}</div>
                )}
            </div>
            {isNavigating ? (
                <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-2 border-orange-500 border-t-transparent" />
            ) : (
                <Search className={cn(
                    "h-4 w-4 sm:h-5 sm:w-5 transition-colors",
                    item ? "text-orange-500" : "text-gray-400"
                )} />
            )}
            <div className={cn(
                "absolute inset-0 bg-gradient-to-r opacity-0 transition-opacity duration-300 -z-10",
                item ? "from-orange-50 to-orange-100 opacity-100" : "",
                isOpen && !item ? "from-gray-50 to-gray-100 opacity-100" : ""
            )} />
        </Button>
    );

    // Custom item component
    const CityItem: React.ComponentType<{
        item: CityMinimalWithCounts;
    }> = ({ item }) => (
        <div className="flex items-center">
            <div className={cn(
                "w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center mr-2",
                item.supportsNotifications ? "bg-orange-100" : "bg-gray-100"
            )}>
                {item.supportsNotifications ? (
                    <Bell className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                ) : (
                    <MapPin className="h-4 w-4" />
                )}
            </div>
            <div>
                <div className="font-medium text-sm sm:text-base">{item.name}</div>
                <div className="text-[10px] sm:text-xs text-gray-500">{item.name_municipality}</div>
            </div>
        </div>
    );

    return (
        <div className="space-y-6 w-full max-w-md mx-auto px-4 sm:px-0">
            <div>
                <Combobox
                    items={cities}
                    value={selectedCity}
                    onChange={(city) => {
                        setSelectedCity(city);
                        if (city) {
                            setIsNavigating(true);
                            if (!city.isPending) {
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
                    emptyMessage="Δεν βρέθηκε Δήμος με αυτό το όνομα."
                />

                {/* Quick Selection for Listed Cities */}
                {!hideQuickSelection && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="mt-4 flex flex-wrap justify-center gap-2"
                    >
                        {cities
                            .filter(city => city.isListed)
                            .slice(0, 5)
                            .map((city) => (
                                <motion.div
                                    key={city.id}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.4 + cities.indexOf(city) * 0.1 }}
                                >
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-xs sm:text-sm rounded-xl"
                                        onClick={() => {
                                            if (!city.isPending) {
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