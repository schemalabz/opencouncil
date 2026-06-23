'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
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
    topics: Topic[];
    onFiltersChange: (filters: MapFiltersState) => void;
}

export function MapFilters({ filters, topics, onFiltersChange }: MapFiltersProps) {
    const t = useTranslations('map.filters');
    const [open, setOpen] = useState(false);
    const [localMonthsBack, setLocalMonthsBack] = useState(filters.monthsBack);
    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

    // Update local state when filters prop changes
    useEffect(() => {
        setLocalMonthsBack(filters.monthsBack);
    }, [filters.monthsBack]);

    const handleTopicsChange = (selected: Topic[]) => {
        onFiltersChange({ ...filters, selectedTopics: selected });
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

    // Generate a localized filter summary (e.g. "Topics about X from the last 3 months")
    const getFilterSummary = () => {
        const topicCount = filters.selectedTopics.length;
        const totalTopics = topics.length;
        const months = filters.monthsBack;

        let topicPart = '';
        if (topicCount === 0) {
            topicPart = t('summaryNoTopics');
        } else if (topicCount === totalTopics) {
            topicPart = t('summaryAllTopics');
        } else if (topicCount === 1) {
            topicPart = t('summaryOneTopic', { name: filters.selectedTopics[0].name });
        } else {
            topicPart = t('summaryManyTopics', { count: topicCount });
        }

        let timePart = '';
        if (months === 1) {
            timePart = t('summaryLastMonth');
        } else if (months === 12) {
            timePart = t('summaryLastYear');
        } else if (months === 24) {
            timePart = t('summaryLastTwoYears');
        } else if (months >= 12) {
            const years = Math.floor(months / 12);
            const remainingMonths = months % 12;
            if (remainingMonths === 0) {
                timePart = t('summaryLastYears', { years });
            } else {
                timePart = t('summaryLastYearsAndMonths', { years, months: remainingMonths });
            }
        } else {
            timePart = t('summaryLastMonths', { months });
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
                    <span className="hidden sm:inline">{t('button')}</span>
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-full sm:max-w-md overflow-y-auto">
                <SheetHeader className="text-left mb-6">
                    <SheetTitle>{t('title')}</SheetTitle>
                    <SheetDescription className="text-base font-medium text-foreground pt-2">
                        {getFilterSummary()}
                    </SheetDescription>
                </SheetHeader>

                <div className="space-y-8 pb-6">
                    {/* Date Range Filter */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">
                                {t('timeRange')}
                            </label>
                            <span className="text-sm text-muted-foreground">
                                {t('monthsValue', { months: filters.monthsBack })}
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
                            <span className="absolute left-0 -translate-x-0">{t('scaleMonth')}</span>
                            <span className="absolute left-[21.74%] -translate-x-1/2">{t('scaleHalfYear')}</span>
                            <span className="absolute left-[47.83%] -translate-x-1/2">{t('scaleYear')}</span>
                            <span className="absolute right-0 translate-x-0">{t('scaleTwoYears')}</span>
                        </div>
                    </div>

                    {/* Topic Filter */}
                    <div className="space-y-4">
                        <label className="text-sm font-medium">
                            {t('topicCategories')}
                        </label>
                        <TopicFilter
                            topics={topics}
                            selectedTopics={filters.selectedTopics}
                            onChange={handleTopicsChange}
                        />
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
