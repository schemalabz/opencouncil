"use client";

import { Search, Sparkles } from "lucide-react";
import { Input } from "../ui/input";
import MetadataFilters, { Filters } from "./MetadataFilters";
import { useEffect, useState, useCallback } from "react";
import { SearchResult, search as searchFn } from "@/lib/search/search";
import { Result } from "./Result";
import AnimatedGradientText from "../magicui/animated-gradient-text";
import { useRouter, useSearchParams } from 'next/navigation';
import { getCity } from "@/lib/db/cities";
import { getPerson } from "@/lib/db/people";
import { getParty } from "@/lib/db/parties";

export default function SearchPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [filters, setFilters] = useState<Filters>({
        cityId: searchParams.get('cityId') || undefined,
        personId: searchParams.get('personId') || undefined,
        partyId: searchParams.get('partyId') || undefined,
    });
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [query, setQuery] = useState(searchParams.get('query') || "");

    const updateUrl = useCallback(() => {
        const params = new URLSearchParams();
        if (query) params.set('query', query);
        if (filters.cityId) params.set('cityId', filters.cityId);
        if (filters.personId) params.set('personId', filters.personId);
        if (filters.partyId) params.set('partyId', filters.partyId);
        router.push(`?${params.toString()}`, { scroll: false });
    }, [query, filters.cityId, filters.personId, filters.partyId, router]);

    const search = useCallback(async () => {
        setIsSearching(true);
        updateUrl();
        const newResults = await searchFn({
            query: query,
            cityId: filters.cityId,
            personId: filters.personId,
            partyId: filters.partyId
        });
        setResults(newResults);
        setIsSearching(false);
    }, [query, filters.cityId, filters.personId, filters.partyId, updateUrl]);

    useEffect(() => {
        if (query || filters.cityId || filters.personId || filters.partyId) {
            search();
        }
    }, [query, filters.cityId, filters.personId, filters.partyId, search]);

    useEffect(() => {
        const fetchInitialFilterData = async () => {
            if (filters.cityId) {
                const city = await getCity(filters.cityId);
                if (city) {
                    setFilters(prev => ({ ...prev, cityId: city.id }));
                }
            }
            if (filters.personId) {
                const person = await getPerson(filters.personId);
                if (person) {
                    setFilters(prev => ({
                        ...prev,
                        personId: person.id,
                        cityId: person.cityId,
                        partyId: person.partyId ?? undefined
                    }));
                }
            }
            if (filters.partyId) {
                const party = await getParty(filters.partyId);
                if (party) {
                    setFilters(prev => ({ ...prev, partyId: party.id, cityId: party.cityId }));
                }
            }
        };

        fetchInitialFilterData();
    }, [filters.cityId, filters.personId, filters.partyId]);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex justify-center mb-4">
                <AnimatedGradientText>
                    <span className="flex items-center">
                        <Sparkles className="w-4 h-4 mr-2" />
                        Preview
                    </span>
                </AnimatedGradientText>
            </div>
            <div className='flex flex-row gap-4'>
                <MetadataFilters className="w-1/3" filters={filters} setFilters={setFilters} />
                <form onSubmit={(e) => { e.preventDefault(); search(); }} className="relative w-2/3">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                        placeholder={`Ψάξτε για "Σχολεία", "Αντιπλημμυρικά", "Δημοτική Αστυνομια", ή κάτι άλλο`}
                        className="pl-10 w-full"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                search();
                            }
                        }}
                    />
                </form>
            </div>

            {results.length === 0 ? (
                <div className="flex justify-center">
                    {isSearching ? (
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900 my-24"></div>
                    ) : query ? (
                        <span className="text-muted-foreground italic my-24">
                            Δε βρέθηκαν αποτελέσματα
                        </span>
                    ) : (
                        <span className="text-muted-foreground italic my-24">
                            Πληκτρολογήστε για να αναζητήσετε
                        </span>
                    )}
                </div>
            ) : (
                <>
                    {results.map((r, ind) => <Result key={`$sr-${ind}`} result={r.speakerSegment} />)}
                </>
            )}
        </div>
    );
}
