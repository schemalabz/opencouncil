"use client";

import { Search, Sparkles } from "lucide-react";
import { Input } from "../ui/input";
import MetadataFilters from "./MetadataFilters";
import { useEffect, useState, useCallback, useMemo } from "react";
import { SearchResultLight, search as searchFn } from "@/lib/search";
import { SubjectCard } from "../subject-card";
import { useRouter, useSearchParams } from 'next/navigation';
import { getCity } from "@/lib/db/cities";
import { getPerson } from "@/lib/db/people";
import { getParty } from "@/lib/db/parties";
import { getStatisticsFor } from "@/lib/statistics";
import { Skeleton } from "../ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PersonWithRelations } from "@/lib/db/people";
import { Party } from "@prisma/client";

const PAGE_SIZE = 6;
const SEARCH_DELAY = 500;

interface SearchResultWithCityData extends SearchResultLight {
    cityPeople: PersonWithRelations[];
    cityParties: Party[];
}

// Helper function to fetch data from API
async function fetchFromApi<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch from ${url}`);
    }
    return response.json();
}

export default function SearchPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    // Get all search parameters from URL
    const query = searchParams.get('query') || "";
    const cityId = searchParams.get('cityId') || undefined;
    const personId = searchParams.get('personId') || undefined;
    const partyId = searchParams.get('partyId') || undefined;
    const page = parseInt(searchParams.get('page') || '1');

    // Local state for search input
    const [localQuery, setLocalQuery] = useState(query);

    // State for search results
    const [state, setState] = useState<{
        results: SearchResultWithCityData[];
        total: number;
        isLoading: boolean;
        error: Error | null;
    }>({
        results: [],
        total: 0,
        isLoading: false,
        error: null
    });

    // Update URL parameters
    const updateSearchParams = useCallback((updates: Record<string, string | undefined>) => {
        const params = new URLSearchParams(searchParams.toString());
        
        // Update or remove parameters
        Object.entries(updates).forEach(([key, value]) => {
            if (value === undefined || value === '') {
                params.delete(key);
            } else {
                params.set(key, value);
            }
        });

        // Reset to page 1 when query or filters change
        if (updates.query !== undefined || updates.cityId !== undefined || 
            updates.personId !== undefined || updates.partyId !== undefined) {
            params.set('page', '1');
        }

        // If all filters are cleared, ensure we keep the query if it exists
        if (updates.cityId === undefined && updates.personId === undefined && updates.partyId === undefined) {
            const query = params.get('query');
            if (query) {
                params.set('query', query);
            }
        }

        // Remove empty parameters
        for (const [key, value] of params.entries()) {
            if (!value) {
                params.delete(key);
            }
        }

        router.push(`?${params.toString()}`, { scroll: false });
    }, [router, searchParams]);

    // Debounced URL update for search
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (localQuery !== query) {
                updateSearchParams({ query: localQuery || undefined });
            }
        }, SEARCH_DELAY);

        return () => clearTimeout(timeoutId);
    }, [localQuery, query, updateSearchParams]);

    // Perform search
    const performSearch = useCallback(async () => {
        if (!query) {
            setState(prev => ({ ...prev, results: [], total: 0 }));
            return;
        }

        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            // 1. Get search results
            const response = await searchFn({
                query,
                cityIds: cityId ? [cityId] : undefined,
                personIds: personId ? [personId] : undefined,
                partyIds: partyId ? [partyId] : undefined,
                config: {
                    enableSemanticSearch: true,
                    size: PAGE_SIZE,
                    from: (page - 1) * PAGE_SIZE,
                    detailed: false
                }
            });

            // 2. Get unique city IDs
            const cityIds = [...new Set(response.results.map(result => result.councilMeeting.city.id))];

            // 3. Batch all data fetching
            const [
                peopleByCityId,
                partiesByCityId,
                statisticsBySubject
            ] = await Promise.all([
                // Create people index during fetch
                Promise.all(cityIds.map(async cityId => {
                    const people = await fetchFromApi<PersonWithRelations[]>(`/api/cities/${cityId}/people`);
                    return [cityId, people] as const;
                })).then(results => Object.fromEntries(results)),
                // Create parties index during fetch
                Promise.all(cityIds.map(async cityId => {
                    const parties = await fetchFromApi<Party[]>(`/api/cities/${cityId}/parties`);
                    return [cityId, parties] as const;
                })).then(results => Object.fromEntries(results)),
                // Batch statistics requests
                Promise.all(response.results.map(result => 
                    getStatisticsFor({ subjectId: result.id }, ["person", "party"])
                ))
            ]);

            // 4. Process results in a single pass with direct lookups
            const resultsWithStats = response.results.map((result, index) => {
                const cityId = result.councilMeeting.city.id;
                return {
                    ...result,
                    statistics: statisticsBySubject[index],
                    cityPeople: peopleByCityId[cityId] || [],
                    cityParties: partiesByCityId[cityId] || []
                };
            });

            // 5. Update state once with all data
            setState({
                results: resultsWithStats,
                total: response.total,
                isLoading: false,
                error: null
            });
        } catch (err) {
            const error = err instanceof Error ? err : new Error('An error occurred during search');
            setState(prev => ({ ...prev, error, isLoading: false }));
            toast({
                variant: "destructive",
                title: "Search Error",
                description: error.message
            });
            console.error('Search error:', err);
        }
    }, [query, cityId, personId, partyId, page, toast]);

    // Search when URL parameters change
    useEffect(() => {
        performSearch();
    }, [query, cityId, personId, partyId, page, performSearch]);

    // Fetch initial filter data
    useEffect(() => {
        const fetchInitialFilterData = async () => {
            try {
                const updates: Record<string, string | undefined> = {};

                if (cityId) {
                    const city = await getCity(cityId);
                    if (!city) updates.cityId = undefined;
                }

                if (personId) {
                    const person = await getPerson(personId);
                    if (person) {
                        updates.personId = person.id;
                        updates.cityId = person.cityId;
                        updates.partyId = person.partyId ?? undefined;
                    } else {
                        updates.personId = undefined;
                    }
                }

                if (partyId) {
                    const party = await getParty(partyId);
                    if (party) {
                        updates.partyId = party.id;
                        updates.cityId = party.cityId;
                    } else {
                        updates.partyId = undefined;
                    }
                }

                if (Object.keys(updates).length > 0) {
                    updateSearchParams(updates);
                }
            } catch (err) {
                console.error('Error fetching initial filter data:', err);
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Failed to load filter data"
                });
            }
        };

        fetchInitialFilterData();
    }, [cityId, personId, partyId, updateSearchParams, toast]);

    const totalPages = Math.ceil(state.total / PAGE_SIZE);

    // Memoize the grid of results
    const resultsGrid = useMemo(() => (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {state.results.map((result) => (
                <SubjectCard
                    key={result.id}
                    subject={result}
                    city={result.councilMeeting.city}
                    meeting={result.councilMeeting}
                    parties={result.cityParties}
                    persons={result.cityPeople}
                    showContext={true}
                />
            ))}
        </div>
    ), [state.results]);

    return (
        <div className="flex flex-col gap-6 max-w-7xl mx-auto px-4 py-8">
            <div className="flex flex-col gap-2">
                <div className="flex justify-center mb-2">
                    <div className="flex items-center justify-center">
                        <div className="p-3 rounded-full bg-[hsl(var(--orange))]/10">
                            <Sparkles className="w-8 h-8 text-[hsl(var(--orange))]" />
                        </div>
                    </div>
                </div>
                <div className="text-center">
                    <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-[hsl(var(--orange))] to-[hsl(var(--accent))] bg-clip-text text-transparent">
                        Αναζήτηση
                    </h2>
                    <p className="text-muted-foreground text-sm">
                        Αναζητήστε θέματα συμβουλίων, τοποθετήσεις ομιλητών και περισσότερα
                    </p>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-4">
                <div className="w-full lg:w-1/4">
                    <div className="sticky top-4">
                        <MetadataFilters 
                            className="w-full" 
                            filters={{ cityId, personId, partyId }} 
                            setFilters={(filters) => updateSearchParams(filters)} 
                        />
                    </div>
                </div>
                <div className="w-full lg:w-3/4">
                    <form 
                        onSubmit={(e) => { 
                            e.preventDefault(); 
                            updateSearchParams({ query: localQuery });
                        }} 
                        className="relative w-full"
                    >
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                            <Input
                                placeholder="Πληκτρολογήστε για αναζήτηση..."
                                className="pl-12 h-12 text-base"
                                value={localQuery}
                                onChange={(e) => setLocalQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        updateSearchParams({ query: localQuery });
                                    }
                                }}
                            />
                        </div>
                    </form>

                    {state.error ? (
                        <div className="flex justify-center items-center min-h-[400px]">
                            <div className="text-center space-y-2">
                                <div className="text-destructive text-lg font-medium">Σφάλμα αναζήτησης</div>
                                <span className="text-muted-foreground">{state.error instanceof Error ? state.error.message : 'An error occurred'}</span>
                            </div>
                        </div>
                    ) : state.isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
                            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                                <Skeleton key={i} className="h-[280px] w-full rounded-lg" />
                            ))}
                        </div>
                    ) : !query ? (
                        <div className="flex justify-center items-center min-h-[400px]">
                            <div className="text-center space-y-2">
                                <div className="text-muted-foreground text-lg">Καλώς ήρθατε στην αναζήτηση</div>
                                <p className="text-muted-foreground text-sm">
                                    Πληκτρολογήστε για να αναζητήσετε θέματα συμβουλίων
                                </p>
                            </div>
                        </div>
                    ) : state.results.length === 0 ? (
                        <div className="flex justify-center items-center min-h-[400px]">
                            <div className="text-center space-y-2">
                                <div className="text-muted-foreground text-lg">Δε βρέθηκαν αποτελέσματα</div>
                                <p className="text-muted-foreground text-sm">
                                    Δοκιμάστε να αλλάξετε τους όρους αναζήτησης ή τα φίλτρα
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="mt-6">
                                <div className="flex items-center justify-between mb-4">
                                    <p className="text-sm text-muted-foreground">
                                        Βρέθηκαν {state.total} αποτελέσματα
                                    </p>
                                </div>
                                {resultsGrid}
                            </div>
                            {totalPages > 1 && (
                                <div className="flex justify-center gap-2 mt-8">
                                    <button
                                        onClick={() => updateSearchParams({ page: (page - 1).toString() })}
                                        disabled={page === 1}
                                        className="px-4 py-2 rounded-md border bg-background hover:bg-accent disabled:opacity-50 disabled:hover:bg-background transition-colors"
                                    >
                                        Προηγούμενο
                                    </button>
                                    <div className="px-4 py-2 text-sm text-muted-foreground">
                                        Σελίδα {page} από {totalPages}
                                    </div>
                                    <button
                                        onClick={() => updateSearchParams({ page: (page + 1).toString() })}
                                        disabled={page === totalPages}
                                        className="px-4 py-2 rounded-md border bg-background hover:bg-accent disabled:opacity-50 disabled:hover:bg-background transition-colors"
                                    >
                                        Επόμενο
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
