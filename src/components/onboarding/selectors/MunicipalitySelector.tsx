import { MapPin, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Combobox from '@/components/Combobox';
import { CityMinimalWithCounts } from '@/lib/db/cities';
import { isPublic } from "@/lib/cityStatus";
import { CityComboboxItem } from '@/components/cities/CityComboboxItem';

interface MunicipalitySelectorProps {
    cities: CityMinimalWithCounts[];
    value: CityMinimalWithCounts | null;
    onCitySelect: (city: CityMinimalWithCounts | null) => void;
    isNavigating?: boolean;
}

export function MunicipalitySelector({
    cities,
    value,
    onCitySelect,
    isNavigating = false,
}: MunicipalitySelectorProps) {
    const t = useTranslations('MunicipalitySelector');
    // Group cities
    const groups = [
        {
            key: 'supported',
            label: t('groupSupported'),
            items: cities.filter(city => isPublic(city.status)),
            icon: MapPin
        },
        {
            key: 'all',
            label: t('groupAll'),
            items: cities.filter(city => !isPublic(city.status)),
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

    return (
        <div className="space-y-6 w-full max-w-md mx-auto px-4 sm:px-0">
            <div>
                <Combobox
                    items={cities}
                    value={value}
                    onChange={onCitySelect}
                    placeholder={t('placeholder')}
                    searchPlaceholder={t('searchPlaceholder')}
                    groups={groups}
                    ItemComponent={CityComboboxItem}
                    TriggerComponent={CityTrigger}
                    getItemLabel={(city) => city.name}
                    getItemValue={(city) => `${city.name} ${city.name_municipality}`}
                    clearable
                    emptyMessage={t('emptyMessage')}
                />

                {/* Decorative elements */}
                <div className="absolute -z-10 -top-6 -left-6 w-12 h-12 rounded-full bg-orange-100 opacity-50" />
                <div className="absolute -z-10 -bottom-4 -right-4 w-8 h-8 rounded-full bg-orange-200 opacity-40" />
            </div>
        </div>
    );
} 