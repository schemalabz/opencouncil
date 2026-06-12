"use client"

import { Building2, Calendar, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AdministrativeBodyType, Topic } from '@prisma/client';
import { cn } from '@/lib/utils';
import Icon from '@/components/icon';
import { normalizeIconName } from '@/lib/map/adapters';
import { contrastTextColor } from '@/lib/map/colors';
import { formatDate } from '@/lib/formatters/time';
import { hasNarrowingFilters, type MapFilterState } from '@/lib/map/params';
import type { MapMunicipality } from '@/lib/map/types';

interface ActiveFilterChipsProps {
    filter: MapFilterState;
    topics: Topic[];
    municipalities: MapMunicipality[];
    onFilterChange: (next: MapFilterState) => void;
    className?: string;
}

function removeFrom(list: string[] | null, value: string): string[] | null {
    const next = (list ?? []).filter(item => item !== value);
    return next.length > 0 ? next : null;
}

/**
 * Everything currently narrowing the map, as removable chips above it.
 */
export function ActiveFilterChips({ filter, topics, municipalities, onFilterChange, className }: ActiveFilterChipsProps) {
    const t = useTranslations('map');
    if (!hasNarrowingFilters(filter)) return null;

    const chipClass = 'flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background pl-2.5 pr-1.5 text-xs font-medium shadow-md';
    const removeClass = 'flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10';

    const activeTopics = topics.filter(topic => filter.topicIds?.includes(topic.id));
    const activeCities = municipalities.filter(municipality => filter.cityIds?.includes(municipality.id));
    const removeBody = (bodyType: AdministrativeBodyType) => {
        const next = (filter.bodyTypes ?? []).filter(item => item !== bodyType);
        onFilterChange({ ...filter, bodyTypes: next.length > 0 ? next : null });
    };
    const dateLabel = filter.dateFrom || filter.dateTo
        ? [
            filter.dateFrom ? formatDate(new Date(filter.dateFrom)) : '…',
            filter.dateTo ? formatDate(new Date(filter.dateTo)) : '…',
        ].join(' – ')
        : null;

    return (
        <div className={cn('flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}>
            {activeTopics.map(topic => {
                const iconName = normalizeIconName(topic.icon);
                const textColor = contrastTextColor(topic.colorHex);
                return (
                    <span
                        key={`topic-${topic.id}`}
                        className={chipClass}
                        style={{ backgroundColor: topic.colorHex, borderColor: topic.colorHex, color: textColor }}
                    >
                        {iconName && <Icon name={iconName} color={textColor} size={12} />}
                        {topic.name}
                        <button
                            type="button"
                            aria-label={t('removeFilter', { name: topic.name })}
                            className={removeClass}
                            onClick={() => onFilterChange({ ...filter, topicIds: removeFrom(filter.topicIds, topic.id) })}
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </span>
                );
            })}
            {activeCities.map(municipality => (
                <span key={`city-${municipality.id}`} className={chipClass}>
                    <Building2 className="h-3 w-3 text-muted-foreground" />
                    {municipality.name}
                    <button
                        type="button"
                        aria-label={t('removeFilter', { name: municipality.name })}
                        className={removeClass}
                        onClick={() => onFilterChange({ ...filter, cityIds: removeFrom(filter.cityIds, municipality.id) })}
                    >
                        <X className="h-3 w-3" />
                    </button>
                </span>
            ))}
            {(filter.bodyTypes ?? []).map(bodyType => (
                <span key={`body-${bodyType}`} className={chipClass}>
                    {t(`bodyTypes.${bodyType}`)}
                    <button
                        type="button"
                        aria-label={t('removeFilter', { name: t(`bodyTypes.${bodyType}`) })}
                        className={removeClass}
                        onClick={() => removeBody(bodyType)}
                    >
                        <X className="h-3 w-3" />
                    </button>
                </span>
            ))}
            {dateLabel && (
                <span className={chipClass}>
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    {dateLabel}
                    <button
                        type="button"
                        aria-label={t('removeFilter', { name: dateLabel })}
                        className={removeClass}
                        onClick={() => onFilterChange({ ...filter, dateFrom: null, dateTo: null })}
                    >
                        <X className="h-3 w-3" />
                    </button>
                </span>
            )}
        </div>
    );
}
