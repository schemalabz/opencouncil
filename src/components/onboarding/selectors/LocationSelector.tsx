'use client';

import { X, MapPin, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Location } from '@/lib/types/onboarding';
import { PlaceSuggestion } from '@/lib/google-maps';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { CityWithGeometry } from '@/lib/db/cities';
import { useLocationSearch, type LocationSearchError } from './useLocationSearch';

interface LocationSelectorProps {
    selectedLocations: Location[];
    onSelect: (location: Location) => void;
    onRemove: (index: number) => void;
    city: CityWithGeometry;
    onLocationClick?: (location: Location) => void;
    hideSelectedList?: boolean;
    /** Id of the search input, so a label outside the component can name it. */
    inputId?: string;
}

export function LocationSelector({
    selectedLocations,
    onSelect,
    onRemove,
    city,
    onLocationClick,
    hideSelectedList = false,
    inputId,
}: LocationSelectorProps) {
    const t = useTranslations('Common');
    const search = useLocationSearch(city);
    const { inputValue, suggestions, isSelecting: isSelectingLocation } = search;

    const errorMessage = (error: LocationSearchError): string => {
        switch (error.kind) {
            case 'noResults':
                return t('locationSearchNoResults', { query: error.query, cityName: city.name });
            case 'unavailable':
                return t('locationSearchUnavailable');
            case 'limitExceeded':
                return t('locationSearchLimitExceeded');
            case 'apiError':
                return t('locationSearchApiError', { status: error.status });
            case 'network':
                return t('locationSearchNetworkError');
            case 'generic':
                return t('locationSearchGenericError');
            case 'detailsUnavailable':
                return t('locationDetailsUnavailable');
            case 'detailsError':
                return t('locationDetailsError');
        }
    };
    const error = search.error ? errorMessage(search.error) : null;

    const handleSelectLocation = async (suggestion: PlaceSuggestion) => {
        const location = await search.select(suggestion);
        if (location) onSelect(location);
    };

    return (
        <div className="space-y-5">
            <div className="relative">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input
                            id={inputId}
                            type="text"
                            inputMode="search"
                            autoComplete="off"
                            data-1p-ignore
                            data-lpignore="true"
                            data-form-type="other"
                            placeholder={t('searchAddressPlaceholder', { cityName: city.name })}
                            aria-label={t('searchAddressInMunicipality', { cityName: city.name })}
                            className={`pl-10 py-5 text-base md:text-sm ${search.busy ? 'pr-10' : ''}`}
                            value={inputValue}
                            onChange={(e) => search.changeInput(e.target.value)}
                            disabled={isSelectingLocation}
                        />
                        {search.busy && (
                            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none z-10">
                                <Loader2 className="h-5 w-5 md:h-4 md:w-4 animate-spin text-primary" />
                            </div>
                        )}
                    </div>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={search.clear}
                        className={cn(
                            "transition-opacity h-11 w-11 md:h-10 md:w-10 touch-manipulation",
                            inputValue ? "opacity-100" : "opacity-0"
                        )}
                        disabled={!inputValue}
                    >
                        <X className="h-5 w-5 md:h-4 md:w-4" />
                    </Button>
                </div>

                {error && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md text-sm flex items-center gap-2 text-red-600">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                {suggestions.length > 0 && (
                    <div className="absolute z-10 mt-2 w-full bg-white rounded-md shadow-lg max-h-60 overflow-auto border border-gray-200">
                        <ul className="py-1">
                            {suggestions.map((suggestion) => (
                                <li
                                    key={suggestion.id}
                                    className={cn(
                                        "px-4 py-4 md:py-3 hover:bg-gray-50 active:bg-gray-100 flex items-center gap-3 border-b last:border-b-0 border-gray-100 touch-manipulation min-h-[48px] md:min-h-0",
                                        isSelectingLocation ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                                    )}
                                    onClick={() => !isSelectingLocation && handleSelectLocation(suggestion)}
                                >
                                    <MapPin className="h-5 w-5 md:h-4 md:w-4 text-primary flex-shrink-0" />
                                    <span className="line-clamp-2 text-base md:text-sm">{suggestion.text}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {!hideSelectedList && (selectedLocations.length > 0 ? (
                <div className="mt-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">{t('selectedLocationsCount', { count: selectedLocations.length })}</div>
                    <div className="grid grid-cols-1 gap-2">
                        {selectedLocations.map((location, index) => (
                            <div
                                key={`loc-${index}`}
                                className={`flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-primary/40 hover:bg-primary/5 transition-colors group ${onLocationClick ? 'cursor-pointer' : ''
                                    }`}
                                onClick={() => onLocationClick?.(location)}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                                    <div className="truncate text-sm font-medium">{location.text}</div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-11 md:h-7 px-3 md:px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-full flex-shrink-0 opacity-80 group-hover:opacity-100 touch-manipulation min-w-[88px] md:min-w-0"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRemove(index);
                                    }}
                                >
                                    <X className="h-4 w-4 md:h-3 md:w-3 mr-1" />
                                    <span className="hidden sm:inline">{t('remove')}</span>
                                    <span className="sm:hidden">{t('removeShort')}</span>
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="mt-6 text-center p-6 border border-dashed border-gray-300 rounded-lg bg-gray-50">
                    <MapPin className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-gray-500 text-sm">{t('noLocationsSelected')}</p>
                    <p className="text-gray-500 text-xs mt-1">{t('noLocationsHint')}</p>
                </div>
            ))}
        </div>
    );
} 