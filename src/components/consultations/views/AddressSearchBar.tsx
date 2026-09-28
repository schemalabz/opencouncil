"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { useLocationSearch, type LocationSearchError } from "@/components/onboarding/selectors/useLocationSearch";
import type { CityWithGeometry } from "@/lib/db/cities";
import type { PlaceSuggestion } from "@/lib/google-maps";
import type { Location } from "@/lib/types/onboarding";
import { cn } from "@/lib/utils";

const LABEL = 'Βρείτε τον δρόμο σας';

function errorText(error: LocationSearchError): string {
    switch (error.kind) {
        case 'noResults':
            return `Δεν βρέθηκε διεύθυνση για «${error.query}» στον δήμο.`;
        case 'detailsUnavailable':
        case 'detailsError':
            return 'Δεν βρέθηκε το σημείο αυτής της διεύθυνσης. Διαλέξτε άλλη πρόταση.';
        default:
            return 'Η αναζήτηση διευθύνσεων δεν είναι διαθέσιμη αυτή τη στιγμή. Δοκιμάστε ξανά σε λίγο.';
    }
}

/** The map's search bar: type an address, pick a suggestion, and the reader's address is set. */
export default function AddressSearchBar({ city, address, onAddress }: {
    city: CityWithGeometry;
    /** The reader's current address, shown until they type a new one. */
    address: Location | null;
    onAddress: (location: Location) => void;
}) {
    const { inputValue, changeInput, suggestions, busy, isSelecting, error, clear, select } = useLocationSearch(city);
    const [active, setActive] = useState(0);
    const listId = useId();

    const pick = async (suggestion: PlaceSuggestion) => {
        const location = await select(suggestion);
        if (location) onAddress(location);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (suggestions.length === 0) {
            if (event.key === 'Escape') clear();
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActive(index => (index + step + suggestions.length) % suggestions.length);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            void pick(suggestions[Math.min(active, suggestions.length - 1)]);
        } else if (event.key === 'Escape') {
            clear();
        }
    };

    return (
        <div className="relative min-w-0 flex-1">
            <div className="flex h-12 items-center gap-3 rounded-full bg-white px-4 shadow-md focus-within:ring-2 focus-within:ring-[#c2410c]">
                <Search className="h-5 w-5 shrink-0 text-stone-600" aria-hidden="true" />
                <input
                    type="text"
                    inputMode="search"
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    role="combobox"
                    aria-expanded={suggestions.length > 0}
                    aria-controls={listId}
                    aria-label={LABEL}
                    value={inputValue}
                    onChange={(e) => { changeInput(e.target.value); setActive(0); }}
                    onKeyDown={onKeyDown}
                    disabled={isSelecting}
                    placeholder={address?.text ?? LABEL}
                    className={cn(
                        "min-w-0 flex-1 bg-transparent text-base text-stone-900 outline-none placeholder:text-stone-500",
                        address && "placeholder:font-semibold placeholder:text-stone-900"
                    )}
                />
                {busy ? (
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin text-stone-500" aria-hidden="true" />
                ) : inputValue ? (
                    <button type="button" onClick={clear} aria-label="Καθαρισμός" className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100">
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                ) : null}
            </div>
            {error && (
                <p role="alert" className="mt-2 rounded-2xl bg-white px-4 py-2.5 text-sm text-red-700 shadow-md">{errorText(error)}</p>
            )}
            {suggestions.length > 0 && (
                <ul id={listId} role="listbox" aria-label="Διευθύνσεις" className="absolute inset-x-0 top-14 z-30 max-h-72 overflow-auto rounded-2xl bg-white py-1 shadow-lg">
                    {suggestions.map((suggestion, index) => (
                        <li key={suggestion.id} role="option" aria-selected={index === active}>
                            <button
                                type="button"
                                onClick={() => pick(suggestion)}
                                onMouseEnter={() => setActive(index)}
                                disabled={isSelecting}
                                className={cn(
                                    "flex w-full items-center gap-3 px-4 py-3 text-left text-base text-stone-900",
                                    index === active && "bg-stone-100"
                                )}
                            >
                                <MapPin className="h-4 w-4 shrink-0 text-[#c2410c]" aria-hidden="true" />
                                <span className="line-clamp-2">{suggestion.text}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
