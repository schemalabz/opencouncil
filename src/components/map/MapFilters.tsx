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
import { Filter } from 'lucide-react';

export interface MapFiltersState {
    monthsBack: number;
    selectedTopics: Topic[];
}

interface MapFiltersProps {
    filters: MapFiltersState;
    allTopics: Topic[];
    onFiltersChange: (filters: MapFiltersState) => void;
}

export function MapFilters({ filters, allTopics, onFiltersChange }: MapFiltersProps) {
    const [open, setOpen] = useState(false);
    const [localMonthsBack, setLocalMonthsBack] = useState(filters.monthsBack);
    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

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

    // Generate filter summary in Greek
    const getFilterSummary = () => {
        const topicCount = filters.selectedTopics.length;
        const totalTopics = allTopics.length;
        const months = filters.monthsBack;

        let topicPart = '';
        if (topicCount === 0) {
            topicPart = 'Κανένα θέμα';
        } else if (topicCount === totalTopics) {
            topicPart = 'Όλα τα θέματα';
        } else if (topicCount === 1) {
            topicPart = `Θέματα για ${filters.selectedTopics[0].name}`;
        } else {
            topicPart = `Θέματα για ${topicCount} θεματικές`;
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

        return `${topicPart} ${timePart}`;
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

