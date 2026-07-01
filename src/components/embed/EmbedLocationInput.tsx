'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { MapPin, X, Loader2 } from 'lucide-react';
import { getPlaceSuggestions, getPlaceDetails, type PlaceSuggestion } from '@/lib/google-maps';
import { useDebounce } from '@/hooks/use-debounce';
import { encodeGeohash } from '@/lib/geo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface EmbedLocation {
    /** geohash-6 of the chosen address — the only thing that lands in the embed URL. */
    geohash: string;
    /** Human-readable address, kept in the configurator for display only. */
    address: string;
}

interface EmbedLocationInputProps {
    /** Biases the address search toward this city. */
    cityName?: string;
    value: EmbedLocation | null;
    onChange: (value: EmbedLocation | null) => void;
}

/**
 * Address autocomplete (Google Places) that resolves a chosen address to a
 * geohash-6. Only the geohash is exposed to the caller — the precise address
 * never leaves the configurator.
 */
export function EmbedLocationInput({ cityName, value, onChange }: EmbedLocationInputProps) {
    const t = useTranslations('EmbedConfigurator');
    const [input, setInput] = useState('');
    const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const debounced = useDebounce(input, 300);

    useEffect(() => {
        let active = true;
        if (debounced.trim().length < 2) {
            setSuggestions([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        getPlaceSuggestions(debounced, cityName)
            .then(res => {
                if (!active) return;
                setSuggestions(res.data ?? []);
                setOpen(true);
            })
            .catch(() => {
                if (!active) return;
                setSuggestions([]);
                setOpen(false);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [debounced, cityName]);

    const select = async (suggestion: PlaceSuggestion) => {
        setOpen(false);
        setInput('');
        setSuggestions([]);
        const details = await getPlaceDetails(suggestion.placeId);
        if (!details) return;
        onChange({ geohash: encodeGeohash(details.coordinates, 6), address: details.text });
    };

    if (value) {
        return (
            <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span className="flex items-center gap-2 truncate">
                    <MapPin size={14} className="shrink-0 text-muted-foreground" />
                    <span className="truncate">{value.address}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => onChange(null)} className="h-6 px-1 shrink-0">
                    <X size={14} />
                </Button>
            </div>
        );
    }

    return (
        <div className="relative">
            <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={t('addressPlaceholder')}
                onFocus={() => suggestions.length > 0 && setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
            />
            {loading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {open && suggestions.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-auto rounded-md border bg-background shadow-md max-h-56">
                    {suggestions.map(s => (
                        <li key={s.id}>
                            <button
                                type="button"
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => select(s)}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                            >
                                {s.text}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
