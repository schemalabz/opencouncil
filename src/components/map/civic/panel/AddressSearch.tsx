"use client"

import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { getPlaceDetails, getPlaceSuggestions, type PlaceSuggestion } from '@/lib/google-maps';

interface AddressSearchProps {
    onLocationSelect: (coordinates: [number, number], text: string) => void;
    onClear?: () => void;
    /** Collapsed round icon-button until opened (mobile). */
    compact?: boolean;
    className?: string;
}

/**
 * Greece-wide address search (Google Places) — selecting a suggestion flies
 * the map there. Reuses the onboarding LocationSelector's geocoding plumbing
 * without its city scoping.
 */
export function AddressSearch({ onLocationSelect, onClear, compact = false, className }: AddressSearchProps) {
    const t = useTranslations('map');
    const [isOpen, setIsOpen] = useState(!compact);
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasSelection, setHasSelection] = useState(false);
    const debouncedQuery = useDebounce(query, 300);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        if (!debouncedQuery || debouncedQuery.trim().length < 2 || hasSelection) {
            setSuggestions([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        getPlaceSuggestions(debouncedQuery).then(result => {
            if (cancelled) return;
            setSuggestions(result.data.filter((s): s is PlaceSuggestion => Boolean(s)));
            setIsLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [debouncedQuery, hasSelection]);

    // Click-away closes the suggestion list
    useEffect(() => {
        const onPointerDown = (event: PointerEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setSuggestions([]);
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, []);

    const handleSelect = async (suggestion: PlaceSuggestion) => {
        setSuggestions([]);
        setQuery(suggestion.text);
        setHasSelection(true);
        const details = await getPlaceDetails(suggestion.placeId);
        if (details) {
            onLocationSelect(details.coordinates, details.text);
        }
    };

    const handleClear = () => {
        setQuery('');
        setSuggestions([]);
        setHasSelection(false);
        onClear?.();
        if (compact) setIsOpen(false);
        else inputRef.current?.focus();
    };

    if (compact && !isOpen) {
        return (
            <button
                type="button"
                aria-label={t('searchOpen')}
                onClick={() => {
                    setIsOpen(true);
                    setTimeout(() => inputRef.current?.focus(), 50);
                }}
                className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background shadow-md',
                    className,
                )}
            >
                <Search className="h-4 w-4 text-muted-foreground" />
            </button>
        );
    }

    return (
        <div ref={containerRef} className={cn('relative', compact ? 'w-full' : 'w-80', className)}>
            <div className="flex h-10 items-center gap-2 border border-border bg-background px-3 shadow-md">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                    ref={inputRef}
                    value={query}
                    onChange={event => {
                        setQuery(event.target.value);
                        setHasSelection(false);
                    }}
                    onKeyDown={event => {
                        if (event.key === 'Escape') handleClear();
                        if (event.key === 'Enter' && suggestions[0]) void handleSelect(suggestions[0]);
                    }}
                    placeholder={t('searchPlaceholder')}
                    className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {isLoading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                {(query || (compact && isOpen)) && !isLoading && (
                    <button type="button" aria-label={t('searchClear')} onClick={handleClear}>
                        <X className="h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground" />
                    </button>
                )}
            </div>
            {suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-11 z-10 max-h-64 overflow-y-auto rounded-lg border border-border bg-background py-1 shadow-lg">
                    {suggestions.map(suggestion => (
                        <li key={suggestion.id}>
                            <button
                                type="button"
                                onClick={() => void handleSelect(suggestion)}
                                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                            >
                                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1 truncate">{suggestion.text}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
