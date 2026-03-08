'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Topic } from '@prisma/client';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import { TopicFilter } from '@/components/filters/TopicFilter';
import { Slider } from '@/components/ui/slider';
import { Filter, Check, ChevronsUpDown, X, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface MapFiltersState {
    monthsBack: number;
    selectedTopics: Topic[];
    selectedCities: string[]; // Array of city IDs
}

interface CityOption {
    id: string;
    name: string;
    name_en: string;
    meetingsCount: number;
}

interface MapFiltersProps {
    filters: MapFiltersState;
    allTopics: Topic[];
    allCities: CityOption[];
    onFiltersChange: (filters: MapFiltersState) => void;
}

export function MapFilters({ filters, allTopics, allCities, onFiltersChange }: MapFiltersProps) {
    const [open, setOpen] = useState(false);
    const [cityComboboxOpen, setCityComboboxOpen] = useState(false);
    const [citySearch, setCitySearch] = useState('');
    const [localMonthsBack, setLocalMonthsBack] = useState(filters.monthsBack);
    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Reset search when popover closes
    useEffect(() => {
        if (!cityComboboxOpen) {
            setCitySearch('');
        } else {
            // Focus input when popover opens
            setTimeout(() => {
                searchInputRef.current?.focus();
            }, 0);
        }
    }, [cityComboboxOpen]);

    // Update local state when filters prop changes
    useEffect(() => {
        setLocalMonthsBack(filters.monthsBack);
    }, [filters.monthsBack]);

    const handleTopicSelect = (topic: Topic) => {
        onFiltersChange({
            ...filters,
            selectedTopics: [...filters.selectedTopics, topic]
        });
    };

    const handleTopicRemove = (topicId: string) => {
        onFiltersChange({
            ...filters,
            selectedTopics: filters.selectedTopics.filter(t => t.id !== topicId)
        });
    };

    const handleSelectAllTopics = () => {
        onFiltersChange({
            ...filters,
            selectedTopics: allTopics
        });
    };

    const handleRemoveAllTopics = () => {
        onFiltersChange({
            ...filters,
            selectedTopics: []
        });
    };

    const handleCitySelect = (cityId: string) => {
        const isSelected = filters.selectedCities.includes(cityId);
        onFiltersChange({
            ...filters,
            selectedCities: isSelected
                ? filters.selectedCities.filter(id => id !== cityId)
                : [...filters.selectedCities, cityId]
        });
    };

    const handleRemoveCity = (cityId: string) => {
        onFiltersChange({
            ...filters,
            selectedCities: filters.selectedCities.filter(id => id !== cityId)
        });
    };

    const handleSelectAllCities = () => {
        onFiltersChange({
            ...filters,
            selectedCities: allCities.map(c => c.id)
        });
    };

    const handleRemoveAllCities = () => {
        onFiltersChange({
            ...filters,
            selectedCities: []
        });
    };

    // Debounced months change handler
    const handleMonthsChange = useCallback((value: number[]) => {
        const newMonthsBack = value[0];
        setLocalMonthsBack(newMonthsBack);

        // Clear existing timeout
        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }

        // Set new timeout to update filters after 300ms
        debounceTimeout.current = setTimeout(() => {
            console.log('⏱️ Debounced slider update:', newMonthsBack);
            onFiltersChange({
                ...filters,
                monthsBack: newMonthsBack
            });
        }, 300);
    }, [filters, onFiltersChange]);

    // Sort and filter cities (only show those with meetings)
    const availableCities = (allCities || [])
        .filter(c => c.meetingsCount > 0)
        .sort((a, b) => a.name.localeCompare(b.name, 'el'));

    // Filter cities by search term
    const filteredCities = citySearch
        ? availableCities.filter(c =>
            c.name.toLowerCase().includes(citySearch.toLowerCase()) ||
            c.name_en.toLowerCase().includes(citySearch.toLowerCase())
        )
        : availableCities;

    // Generate filter summary in Greek
    const getFilterSummary = () => {
        const topicCount = filters.selectedTopics.length;
        const totalTopics = allTopics.length;
        const cityCount = filters.selectedCities.length;
        const totalCities = availableCities.length;
        const months = filters.monthsBack;

        let cityPart = '';
        if (cityCount === 0 || cityCount === totalCities) {
            cityPart = 'Όλοι οι δήμοι';
        } else if (cityCount === 1) {
            const selectedCity = availableCities.find(c => c.id === filters.selectedCities[0]);
            cityPart = `Δήμος ${selectedCity?.name}`;
        } else {
            cityPart = `${cityCount} δήμοι`;
        }

        let topicPart = '';
        if (topicCount === 0) {
            topicPart = 'κανένα θέμα';
        } else if (topicCount === totalTopics) {
            topicPart = 'όλα τα θέματα';
        } else if (topicCount === 1) {
            topicPart = `θέματα για ${filters.selectedTopics[0].name}`;
        } else {
            topicPart = `θέματα για ${topicCount} θεματικές`;
        }

        let timePart = '';
        if (months === 1) {
            timePart = 'του τελευταίου μήνα';
        } else if (months === 12) {
            timePart = 'του τελευταίου χρόνου';
        } else if (months === 24) {
            timePart = 'των τελευταίων 2 ετών';
        } else if (months >= 12) {
            const years = Math.floor(months / 12);
            const remainingMonths = months % 12;
            if (remainingMonths === 0) {
                timePart = `των τελευταίων ${years} ετών`;
            } else {
                timePart = `των τελευταίων ${years} ετών και ${remainingMonths} μηνών`;
            }
        } else {
            timePart = `των τελευταίων ${months} μηνών`;
        }

        return `${cityPart}, ${topicPart} ${timePart}`;
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button
                    variant="default"
                    size="lg"
                    className="fixed bottom-6 left-6 z-40 rounded-full shadow-lg h-14 px-6 gap-2"
                >
                    <Filter className="h-5 w-5" />
                    <span className="hidden sm:inline">Φίλτρα</span>
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-full sm:max-w-md overflow-y-auto">
                <SheetHeader className="text-left mb-6">
                    <SheetTitle>Φίλτρα Χάρτη</SheetTitle>
                    <SheetDescription className="text-base font-medium text-foreground pt-2">
                        {getFilterSummary()}
                    </SheetDescription>
                </SheetHeader>

                <div className="space-y-8 pb-6">
                    {/* Date Range Filter */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">
                                Χρονικό διάστημα
                            </label>
                            <span className="text-sm text-muted-foreground">
                                {filters.monthsBack === 1 ? '1 μήνας' : `${filters.monthsBack} μήνες`}
                            </span>
                        </div>
                        <Slider
                            value={[localMonthsBack]}
                            onValueChange={handleMonthsChange}
                            min={1}
                            max={24}
                            step={1}
                            className="w-full"
                        />
                        <div className="relative text-xs text-muted-foreground h-4">
                            <span className="absolute left-0 -translate-x-0">1 μήνας</span>
                            <span className="absolute left-[21.74%] -translate-x-1/2">6 μήνες</span>
                            <span className="absolute left-[47.83%] -translate-x-1/2">12 μήνες</span>
                            <span className="absolute right-0 translate-x-0">2 έτη</span>
                        </div>
                    </div>

                    {/* City Filter */}
                    {availableCities.length > 0 && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">
                                Δήμοι
                            </label>
                            {filters.selectedCities.length > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleRemoveAllCities}
                                    className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                                >
                                    Καθαρισμός όλων
                                </Button>
                            )}
                        </div>

                        <div className="space-y-3">
                            {/* Search input - INLINE (No Popover) */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder="Αναζήτηση δήμου..."
                                    value={citySearch}
                                    onChange={(e) => setCitySearch(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 text-sm bg-accent/50 rounded-md border-0 focus:ring-2 focus:ring-primary outline-none transition-all"
                                />
                                {citySearch && (
                                    <button 
                                        onClick={() => setCitySearch('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2"
                                    >
                                        <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                                    </button>
                                )}
                            </div>

                            {/* Cities list - INLINE scrollable area */}
                            <div className="border rounded-md overflow-hidden bg-background">
                                <div className="max-h-[160px] overflow-y-auto p-1 scrollbar-thin">
                                    {/* Select all option */}
                                    <div
                                        role="button"
                                        onClick={() => {
                                            if (filters.selectedCities.length === availableCities.length) {
                                                handleRemoveAllCities();
                                            } else {
                                                handleSelectAllCities();
                                            }
                                        }}
                                        className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm font-medium hover:bg-accent transition-colors"
                                    >
                                        <div className={cn(
                                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-colors",
                                            filters.selectedCities.length === availableCities.length ? "bg-primary text-primary-foreground" : "opacity-50"
                                        )}>
                                            {filters.selectedCities.length === availableCities.length && <Check className="h-3 w-3" />}
                                        </div>
                                        Όλοι οι δήμοι ({availableCities.length})
                                    </div>

                                    {/* Individual cities */}
                                    {filteredCities.length === 0 ? (
                                        <div className="py-6 text-center text-sm text-muted-foreground italic">
                                            Δεν βρέθηκε δήμος.
                                        </div>
                                    ) : (
                                        filteredCities.map((city) => (
                                            <div
                                                key={city.id}
                                                role="button"
                                                onClick={() => handleCitySelect(city.id)}
                                                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm hover:bg-accent transition-colors"
                                            >
                                                <div className={cn(
                                                    "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-colors",
                                                    filters.selectedCities.includes(city.id) ? "bg-primary text-primary-foreground" : "opacity-50"
                                                )}>
                                                    {filters.selectedCities.includes(city.id) && <Check className="h-3 w-3" />}
                                                </div>
                                                <span className="flex-1 truncate">{city.name}</span>
                                                <span className="text-[10px] tabular-nums bg-accent px-1.5 py-0.5 rounded-full text-muted-foreground ml-2">
                                                    {city.meetingsCount}
                                                </span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    )}

                    {/* Topic Filter */}
                    <div className="space-y-4">
                        <label className="text-sm font-medium">
                            Θεματικές κατηγορίες
                        </label>
                        <TopicFilter
                            selectedTopics={filters.selectedTopics}
                            onSelect={handleTopicSelect}
                            onRemove={handleTopicRemove}
                            onSelectAll={handleSelectAllTopics}
                            onRemoveAll={handleRemoveAllTopics}
                        />
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}

