"use client"

import { useTranslations } from 'next-intl';
import type { AdministrativeBodyType, Topic } from '@prisma/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import Icon from '@/components/icon';
import { normalizeIconName } from '@/lib/map/adapters';
import { contrastTextColor } from '@/lib/map/colors';
import { DEFAULT_MAP_FILTER, hasNarrowingFilters, type MapFilterState } from '@/lib/map/params';
import type { MapMunicipality } from '@/lib/map/types';

const BODY_TYPES: AdministrativeBodyType[] = ['council', 'committee', 'community'];

function toggleInList(list: string[] | null, value: string): string[] | null {
    const current = list ?? [];
    const next = current.includes(value)
        ? current.filter(item => item !== value)
        : [...current, value];
    return next.length > 0 ? next : null;
}

interface FilterPaneProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    topics: Topic[];
    /** Officially supported municipalities (the only ones with subjects). */
    municipalities: MapMunicipality[];
    filter: MapFilterState;
    onFilterChange: (next: MapFilterState) => void;
}

/**
 * The filter pane (left sheet): topic chips (multi-select), municipalities,
 * administrative body types, and an exact date range. Changes apply live.
 */
export function FilterPane({ open, onOpenChange, topics, municipalities, filter, onFilterChange }: FilterPaneProps) {
    const t = useTranslations('map');

    const sectionTitle = (label: string) => (
        <h3 className="pb-2 pt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
    );

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="left" className="flex w-full flex-col overflow-y-auto sm:max-w-md">
                <SheetHeader className="text-left">
                    <SheetTitle>{t('filtersTitle')}</SheetTitle>
                </SheetHeader>

                <div className="min-h-0 flex-1">
                    {sectionTitle(t('sectionTopics'))}
                    <div className="flex flex-wrap gap-1.5">
                        {topics.map(topic => {
                            const isSelected = filter.topicIds?.includes(topic.id) ?? false;
                            const iconName = normalizeIconName(topic.icon);
                            const selectedText = contrastTextColor(topic.colorHex);
                            return (
                                <button
                                    key={topic.id}
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => onFilterChange({ ...filter, topicIds: toggleInList(filter.topicIds, topic.id) })}
                                    className={cn(
                                        'flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium transition-colors',
                                        !isSelected && 'bg-background text-foreground hover:bg-muted',
                                    )}
                                    style={isSelected
                                        ? { backgroundColor: topic.colorHex, borderColor: topic.colorHex, color: selectedText }
                                        : { borderColor: `${topic.colorHex}40` }}
                                >
                                    {iconName && <Icon name={iconName} color={isSelected ? selectedText : topic.colorHex} size={13} />}
                                    {topic.name}
                                </button>
                            );
                        })}
                    </div>

                    {sectionTitle(t('sectionCities'))}
                    <div className="space-y-1">
                        {municipalities.map(municipality => {
                            const isSelected = filter.cityIds?.includes(municipality.id) ?? false;
                            return (
                                <div key={municipality.id} className="flex items-center gap-2">
                                    <Checkbox
                                        id={`filter-city-${municipality.id}`}
                                        checked={isSelected}
                                        onCheckedChange={() =>
                                            onFilterChange({ ...filter, cityIds: toggleInList(filter.cityIds, municipality.id) })}
                                    />
                                    <Label htmlFor={`filter-city-${municipality.id}`} className="text-sm font-normal">
                                        {municipality.name_municipality}
                                    </Label>
                                </div>
                            );
                        })}
                    </div>

                    {sectionTitle(t('sectionBodies'))}
                    <div className="flex flex-wrap gap-1.5">
                        {BODY_TYPES.map(bodyType => {
                            const isSelected = filter.bodyTypes?.includes(bodyType) ?? false;
                            return (
                                <button
                                    key={bodyType}
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => onFilterChange({
                                        ...filter,
                                        bodyTypes: (toggleInList(filter.bodyTypes, bodyType) as AdministrativeBodyType[] | null),
                                    })}
                                    className={cn(
                                        'h-8 rounded-full border px-3 text-[13px] font-medium transition-colors',
                                        isSelected
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'border-border bg-background text-foreground hover:bg-muted',
                                    )}
                                >
                                    {t(`bodyTypes.${bodyType}`)}
                                </button>
                            );
                        })}
                    </div>

                    {sectionTitle(t('sectionDates'))}
                    <div className="flex items-center gap-2">
                        <div className="flex-1 space-y-1">
                            <Label htmlFor="filter-date-from" className="text-xs text-muted-foreground">{t('dateFrom')}</Label>
                            <input
                                id="filter-date-from"
                                type="date"
                                value={filter.dateFrom ?? ''}
                                max={filter.dateTo ?? undefined}
                                onChange={event => onFilterChange({ ...filter, dateFrom: event.target.value || null })}
                                className="h-9 w-full border border-border bg-background px-2 text-sm"
                            />
                        </div>
                        <div className="flex-1 space-y-1">
                            <Label htmlFor="filter-date-to" className="text-xs text-muted-foreground">{t('dateTo')}</Label>
                            <input
                                id="filter-date-to"
                                type="date"
                                value={filter.dateTo ?? ''}
                                min={filter.dateFrom ?? undefined}
                                onChange={event => onFilterChange({ ...filter, dateTo: event.target.value || null })}
                                className="h-9 w-full border border-border bg-background px-2 text-sm"
                            />
                        </div>
                    </div>
                    {(filter.dateFrom || filter.dateTo) && (
                        <p className="pt-1.5 text-xs text-muted-foreground">{t('datesOverrideMonths')}</p>
                    )}
                </div>

                <div className="flex shrink-0 gap-3 border-t border-border pt-4">
                    <Button
                        variant="outline"
                        className="flex-1"
                        disabled={!hasNarrowingFilters(filter)}
                        onClick={() => onFilterChange({ ...DEFAULT_MAP_FILTER, monthsBack: filter.monthsBack })}
                    >
                        {t('clearAll')}
                    </Button>
                    <Button className="flex-1" onClick={() => onOpenChange(false)}>
                        {t('done')}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
