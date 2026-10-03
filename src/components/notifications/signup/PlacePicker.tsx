'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, LocateFixed, MapPin, Plus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { authorityKey } from '@/components/cities/overview/authorityKey';
import { useLocationSearch } from '@/components/onboarding/selectors/useLocationSearch';
import { ErrorLine } from '@/components/ui/error-line';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { reverseGeocodePlace } from '@/lib/actions/signupPlaces';
import { captureEvent } from '@/lib/analytics/capture';
import type { CityWithGeometry } from '@/lib/db/cities';
import { getMunicipalityQualifier } from '@/lib/formatters/name';
import type { PlaceSuggestion } from '@/lib/google-maps';
import type { Location } from '@/lib/types/onboarding';
import { cn } from '@/lib/utils';
import { splitPlaceText } from '@/lib/utils/placeLabel';

type LocateState = 'idle' | 'locating' | 'denied' | 'failed' | 'outside';

/** How long a reader must stay on an empty result before it counts as a search that found nothing. */
const EMPTY_SEARCH_SETTLE_MS = 2000;
type LocateFailure = 'denied' | 'unavailable' | 'outside' | 'not_found';

/**
 * The reader's places, and the search that adds one. With no place yet the
 * search is the step's main control: a large field, «Η θέση μου τώρα» for
 * a phone, and one line on what the place is for. Once there is a place,
 * the search folds into «Κι άλλη περιοχή», so a second place is one tap
 * away but not in the way.
 */
export function PlacePicker({
    city,
    locations,
    onAdd,
    onRemove,
    className,
}: {
    city: CityWithGeometry;
    locations: Location[];
    onAdd: (location: Location) => void;
    onRemove: (index: number) => void;
    className?: string;
}) {
    const t = useTranslations('notificationSignup');
    const locale = useLocale();
    const qualifier = getMunicipalityQualifier(city, locale);
    const search = useLocationSearch(city);
    const inputId = useId();
    const errorId = useId();
    const listId = useId();
    // The suggestion the arrow keys are on; -1 while none is.
    const [active, setActive] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const [canLocate, setCanLocate] = useState(false);
    const [locate, setLocate] = useState<LocateState>('idle');
    const locateRequest = useRef(0);

    // Known only in the browser; deciding it during render would differ from the server's HTML.
    useEffect(() => {
        setCanLocate('geolocation' in navigator);
    }, []);

    // Leaving the step drops a «Η θέση μου τώρα» still in flight: the reader moved on without it.
    useEffect(() => {
        const request = locateRequest;
        return () => {
            request.current += 1;
        };
    }, []);

    // The query Google had nothing for: the gap between typing and a place, which nothing measured before.
    // Counted only once the reader stops on it, so «Κουκ», «Κουκά», «Κουκάκ» typed slowly count once, not three times.
    const emptyQuery = search.error?.kind === 'noResults' ? search.error.query : null;
    useEffect(() => {
        if (!emptyQuery) return;
        const timer = setTimeout(
            () => captureEvent('notification_signup_place_search_empty', { city_id: city.id, query_length: emptyQuery.trim().length }),
            EMPTY_SEARCH_SETTLE_MS,
        );
        return () => clearTimeout(timer);
    }, [city.id, emptyQuery]);

    const showSearch = locations.length === 0 || searchOpen;

    const add = (location: Location, source: 'search' | 'locate') => {
        // A «Η θέση μου τώρα» still in flight must not land after the reader chose this place.
        locateRequest.current += 1;
        onAdd(location);
        setSearchOpen(false);
        setLocate('idle');
        captureEvent('notification_signup_place_added', { city_id: city.id, source, place_count: locations.length + 1 });
    };

    // A new list starts with nothing highlighted, so Enter never picks a row the reader did not choose.
    useEffect(() => {
        setActive(-1);
    }, [search.suggestions]);

    const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        const count = search.suggestions.length;
        if (event.key === 'Escape') {
            search.clear();
            return;
        }
        if (count === 0) return;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((index) => (index + 1) % count);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => (index <= 0 ? count - 1 : index - 1));
        } else if (event.key === 'Enter' && active >= 0) {
            event.preventDefault();
            void pick(search.suggestions[active]);
        }
    };

    const pick = async (suggestion: PlaceSuggestion) => {
        const location = await search.select(suggestion);
        if (location) add(location, 'search');
    };

    const locateMe = () => {
        const request = ++locateRequest.current;
        setLocate('locating');
        const fail = (reason: LocateFailure) => {
            if (request !== locateRequest.current) return;
            setLocate(reason === 'denied' ? 'denied' : reason === 'outside' ? 'outside' : 'failed');
            captureEvent('notification_signup_locate_failed', { city_id: city.id, reason });
        };
        navigator.geolocation.getCurrentPosition(
            async ({ coords }) => {
                try {
                    const result = await reverseGeocodePlace({ cityId: city.id, lng: coords.longitude, lat: coords.latitude });
                    if (request !== locateRequest.current) return;
                    if (result.ok) add(result.location, 'locate');
                    else fail(result.reason);
                } catch (error) {
                    console.error('Locating the reader failed:', error);
                    fail('unavailable');
                }
            },
            (error) => fail(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable'),
            { timeout: 10_000, maximumAge: 60_000 },
        );
    };

    const searchError = search.error
        ? search.error.kind === 'noResults'
            ? t(authorityKey('places.noResults', city), { query: search.error.query, qualifier })
            : t('places.searchFailed')
        : null;
    const locateError =
        locate === 'denied'
            ? t('places.locateDenied')
            : locate === 'failed'
              ? t('places.locateFailed')
              : locate === 'outside'
                ? t(authorityKey('places.locateOutside', city), { qualifier })
                : null;

    return (
        <div className={className}>
            {locations.length > 0 && (
                <ul className="flex flex-col gap-2">
                    {locations.map((location, index) => {
                        const { primary, secondary } = splitPlaceText(location.text);
                        return (
                            <li
                                key={`${location.text}-${index}`}
                                className={cn(surfaceCardClass, 'flex items-center gap-3 py-1.5 pl-3.5 pr-1.5')}
                            >
                                <MapPin className="h-5 w-5 shrink-0 text-[hsl(var(--orange))]" aria-hidden />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[15px] leading-tight">{primary}</span>
                                    {secondary && (
                                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{secondary}</span>
                                    )}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => onRemove(index)}
                                    aria-label={t('places.remove', { place: primary })}
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                                >
                                    <X className="h-[18px] w-[18px]" aria-hidden />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}

            {showSearch ? (
                <div className={cn(locations.length > 0 && 'mt-3')}>
                    <div className="relative">
                        <label htmlFor={inputId} className="sr-only">
                            {t(authorityKey('places.searchLabel', city), { qualifier })}
                        </label>
                        <MapPin
                            className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                            aria-hidden
                        />
                        <input
                            ref={inputRef}
                            id={inputId}
                            type="text"
                            inputMode="search"
                            enterKeyHint="search"
                            autoComplete="off"
                            data-1p-ignore
                            data-lpignore="true"
                            data-form-type="other"
                            placeholder={t('places.placeholder')}
                            value={search.inputValue}
                            onChange={(event) => search.changeInput(event.target.value)}
                            onKeyDown={onSearchKeyDown}
                            role="combobox"
                            aria-autocomplete="list"
                            aria-expanded={search.suggestions.length > 0}
                            aria-controls={listId}
                            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
                            disabled={search.isSelecting}
                            aria-describedby={searchError ? errorId : undefined}
                            className="h-[52px] w-full rounded-xl border border-foreground/20 bg-card pl-11 pr-12 text-base outline-none placeholder:text-muted-foreground focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                        />
                        <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
                            {search.busy ? (
                                <span className="flex h-11 w-11 items-center justify-center">
                                    <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--orange))]" aria-hidden />
                                </span>
                            ) : search.inputValue ? (
                                <button
                                    type="button"
                                    onClick={search.clear}
                                    aria-label={t('places.clear')}
                                    className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-[18px] w-[18px]" aria-hidden />
                                </button>
                            ) : null}
                        </span>

                        {search.suggestions.length > 0 && (
                            <ul
                                id={listId}
                                role="listbox"
                                className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg"
                            >
                                {search.suggestions.map((suggestion, index) => {
                                    const { primary, secondary } = splitPlaceText(suggestion.text);
                                    return (
                                        // The input keeps the focus (mousedown is prevented), as a combobox's
                                        // options take none; the arrow keys and Enter pick from the input.
                                        <li
                                            key={suggestion.id}
                                            id={`${listId}-${index}`}
                                            role="option"
                                            aria-selected={index === active}
                                            onMouseDown={(event) => event.preventDefault()}
                                            onMouseEnter={() => setActive(index)}
                                            onClick={() => !search.isSelecting && pick(suggestion)}
                                            className={cn(
                                                'flex min-h-12 cursor-pointer items-center gap-3 border-b border-border px-3.5 py-2.5 last:border-b-0',
                                                index === active && 'bg-muted',
                                                search.isSelecting && 'cursor-not-allowed opacity-50',
                                            )}
                                        >
                                            <MapPin className="h-4 w-4 shrink-0 text-[hsl(var(--orange))]" aria-hidden />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[15px] leading-tight">{primary}</span>
                                                {secondary && (
                                                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{secondary}</span>
                                                )}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {searchError && (
                        <ErrorLine id={errorId} className="mt-2">
                            {searchError}
                        </ErrorLine>
                    )}

                    {canLocate && (
                        <button
                            type="button"
                            onClick={locateMe}
                            disabled={locate === 'locating'}
                            className="mt-2.5 inline-flex h-11 items-center gap-2 rounded-full border border-foreground/20 bg-card pl-3 pr-4 text-sm hover:border-foreground/40 disabled:opacity-70"
                        >
                            {locate === 'locating' ? (
                                <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden />
                            ) : (
                                <LocateFixed className="h-[18px] w-[18px]" aria-hidden />
                            )}
                            {locate === 'locating' ? t('places.locating') : t('places.locate')}
                        </button>
                    )}
                    {locateError && <ErrorLine className="mt-2">{locateError}</ErrorLine>}

                    <p className="mt-2.5 text-xs leading-[1.45] text-muted-foreground">{t('places.privacy')}</p>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => {
                        setSearchOpen(true);
                        // Revealing the field is a deliberate tap, so the keyboard may open with it.
                        setTimeout(() => inputRef.current?.focus(), 0);
                    }}
                    className="mt-1 inline-flex min-h-11 items-center gap-2 px-1 text-sm text-[hsl(var(--orange-deep))] hover:underline"
                >
                    <Plus className="h-4 w-4" aria-hidden />
                    {t('places.addAnother')}
                </button>
            )}
        </div>
    );
}
