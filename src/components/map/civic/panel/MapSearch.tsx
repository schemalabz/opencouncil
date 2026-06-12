"use client"

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Building2, Loader2, MapPin, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Topic } from '@prisma/client';
import { cn, normalizeText } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import Icon from '@/components/icon';
import { normalizeIconName } from '@/lib/map/adapters';
import type { MapMunicipality } from '@/lib/map/types';
import { getPlaceDetails, getPlaceSuggestions, type PlaceSuggestion } from '@/lib/google-maps';

const MAX_TOPIC_SUGGESTIONS = 3;
const MAX_CITY_SUGGESTIONS = 2;
const MAX_PLACE_SUGGESTIONS = 5;

type Suggestion =
    | { kind: 'topic'; topic: Topic }
    | { kind: 'city'; municipality: MapMunicipality }
    | { kind: 'place'; place: PlaceSuggestion };

interface MapSearchProps {
    topics: Topic[];
    municipalities: MapMunicipality[];
    onTopicSelect: (topicId: string) => void;
    onMunicipalitySelect: (municipality: MapMunicipality) => void;
    onLocationSelect: (coordinates: [number, number], text: string) => void;
    onClear?: () => void;
    className?: string;
}

/**
 * The map omnibar: one input suggesting topic filters (instant, local),
 * municipalities (local), and street addresses (Google Places) — each row
 * labeled with what selecting it does.
 */
export function MapSearch({
    topics,
    municipalities,
    onTopicSelect,
    onMunicipalitySelect,
    onLocationSelect,
    onClear,
    className,
}: MapSearchProps) {
    const t = useTranslations('map');
    const [query, setQuery] = useState('');
    const [places, setPlaces] = useState<PlaceSuggestion[]>([]);
    const [isLoadingPlaces, setIsLoadingPlaces] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const debouncedQuery = useDebounce(query, 300);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const normalizedQuery = normalizeText(query.trim());

    // Local matches are instant
    const topicMatches = useMemo(() => {
        if (normalizedQuery.length < 2) return [];
        return topics
            .filter(topic => normalizeText(topic.name).includes(normalizedQuery) ||
                normalizeText(topic.name_en).includes(normalizedQuery))
            .slice(0, MAX_TOPIC_SUGGESTIONS);
    }, [topics, normalizedQuery]);

    const cityMatches = useMemo(() => {
        if (normalizedQuery.length < 2) return [];
        return municipalities
            .filter(municipality => normalizeText(municipality.name).includes(normalizedQuery) ||
                normalizeText(municipality.name_municipality).includes(normalizedQuery))
            .slice(0, MAX_CITY_SUGGESTIONS);
    }, [municipalities, normalizedQuery]);

    // Remote address suggestions are debounced
    useEffect(() => {
        let cancelled = false;
        if (!debouncedQuery || debouncedQuery.trim().length < 2) {
            setPlaces([]);
            setIsLoadingPlaces(false);
            return;
        }
        setIsLoadingPlaces(true);
        getPlaceSuggestions(debouncedQuery).then(result => {
            if (cancelled) return;
            setPlaces(result.data.slice(0, MAX_PLACE_SUGGESTIONS));
            setIsLoadingPlaces(false);
        });
        return () => {
            cancelled = true;
        };
    }, [debouncedQuery]);

    const suggestions = useMemo<Suggestion[]>(() => [
        ...topicMatches.map(topic => ({ kind: 'topic' as const, topic })),
        ...cityMatches.map(municipality => ({ kind: 'city' as const, municipality })),
        ...places.map(place => ({ kind: 'place' as const, place })),
    ], [topicMatches, cityMatches, places]);

    useEffect(() => {
        setActiveIndex(0);
    }, [suggestions.length, normalizedQuery]);

    // Click-away closes
    useEffect(() => {
        const onPointerDown = (event: PointerEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, []);

    const reset = (keepFocus: boolean) => {
        setQuery('');
        setPlaces([]);
        setIsOpen(false);
        if (keepFocus) inputRef.current?.focus();
    };

    const handleSelect = async (suggestion: Suggestion) => {
        if (suggestion.kind === 'topic') {
            onTopicSelect(suggestion.topic.id);
            reset(true);
            return;
        }
        if (suggestion.kind === 'city') {
            onMunicipalitySelect(suggestion.municipality);
            reset(false);
            return;
        }
        reset(false);
        const details = await getPlaceDetails(suggestion.place.placeId);
        if (details) onLocationSelect(details.coordinates, details.text);
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            reset(true);
            onClear?.();
            return;
        }
        if (suggestions.length === 0) return;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex(index => (index + 1) % suggestions.length);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex(index => (index - 1 + suggestions.length) % suggestions.length);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const target = suggestions[activeIndex] ?? suggestions[0];
            if (target) void handleSelect(target);
        }
    };

    const listboxId = useId();
    const showList = isOpen && (suggestions.length > 0 || isLoadingPlaces) && normalizedQuery.length >= 2;

    return (
        <div ref={containerRef} className={cn('relative min-w-0 flex-1', className)}>
            <div className="flex h-10 items-center gap-2 border border-border bg-background px-3 shadow-md">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                    ref={inputRef}
                    value={query}
                    role="combobox"
                    aria-expanded={showList}
                    aria-controls={listboxId}
                    aria-autocomplete="list"
                    aria-label={t('searchUnifiedPlaceholder')}
                    onChange={event => {
                        setQuery(event.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('searchUnifiedPlaceholder')}
                    className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {isLoadingPlaces && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                {query && !isLoadingPlaces && (
                    <button
                        type="button"
                        aria-label={t('searchClear')}
                        onClick={() => {
                            reset(true);
                            onClear?.();
                        }}
                    >
                        <X className="h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground" />
                    </button>
                )}
            </div>

            {showList && (
                <ul id={listboxId} role="listbox" className="absolute left-0 right-0 top-11 z-10 max-h-80 overflow-y-auto rounded-lg border border-border bg-background py-1 shadow-lg">
                    {suggestions.map((suggestion, index) => {
                        const isActive = index === activeIndex;
                        const rowClass = cn(
                            'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm',
                            isActive ? 'bg-muted' : 'hover:bg-muted/60',
                        );
                        if (suggestion.kind === 'topic') {
                            const iconName = normalizeIconName(suggestion.topic.icon);
                            return (
                                <li key={`topic-${suggestion.topic.id}`}>
                                    <button type="button" className={rowClass} onMouseEnter={() => setActiveIndex(index)} onClick={() => void handleSelect(suggestion)}>
                                        <span
                                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                                            style={{ backgroundColor: `${suggestion.topic.colorHex}20` }}
                                        >
                                            {iconName && <Icon name={iconName} color={suggestion.topic.colorHex} size={14} />}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate font-medium">{suggestion.topic.name}</span>
                                        <span className="shrink-0 text-xs text-muted-foreground">{t('actionFilter')}</span>
                                    </button>
                                </li>
                            );
                        }
                        if (suggestion.kind === 'city') {
                            return (
                                <li key={`city-${suggestion.municipality.id}`}>
                                    <button type="button" className={rowClass} onMouseEnter={() => setActiveIndex(index)} onClick={() => void handleSelect(suggestion)}>
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                                            <Building2 className="h-4 w-4 text-muted-foreground" />
                                        </span>
                                        <span className="min-w-0 flex-1 truncate font-medium">{suggestion.municipality.name_municipality}</span>
                                        <span className="shrink-0 text-xs text-muted-foreground">{t('actionGoToCity')}</span>
                                    </button>
                                </li>
                            );
                        }
                        return (
                            <li key={`place-${suggestion.place.id}`}>
                                <button type="button" className={rowClass} onMouseEnter={() => setActiveIndex(index)} onClick={() => void handleSelect(suggestion)}>
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                                        <MapPin className="h-4 w-4 text-muted-foreground" />
                                    </span>
                                    <span className="min-w-0 flex-1 truncate">{suggestion.place.text}</span>
                                    <span className="shrink-0 text-xs text-muted-foreground">{t('actionGoToLocation')}</span>
                                </button>
                            </li>
                        );
                    })}
                    {suggestions.length === 0 && !isLoadingPlaces && (
                        <li className="px-3 py-2 text-sm text-muted-foreground">{t('searchNoResults')}</li>
                    )}
                </ul>
            )}
        </div>
    );
}
