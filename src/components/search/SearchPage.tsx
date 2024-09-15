"use client";

import { Search, Sparkles } from "lucide-react";
import { Input } from "../ui/input";
import MetadataFilters, { Filters } from "./MetadataFilters";
import { useEffect, useState } from "react";
import { SearchResult, search as searchFn } from "@/lib/search/search";
import { Result } from "./Result";
import { Button } from "../ui/button";
import AnimatedGradientText from "../magicui/animated-gradient-text";
import { useRouter, useSearchParams } from 'next/navigation';

const MAX_PAGES = 10;

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
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    const updateUrl = () => {
        const params = new URLSearchParams();
        if (query) params.set('query', query);
        if (filters.cityId) params.set('cityId', filters.cityId);
        if (filters.personId) params.set('personId', filters.personId);
        if (filters.partyId) params.set('partyId', filters.partyId);
        router.push(`?${params.toString()}`, { scroll: false });
    };

    const search = async (reset: boolean = false) => {
        if (reset) {
            setResults([]);
            setPage(1);
            setHasMore(true);
            updateUrl();
        }

        if (!hasMore || isSearching) return;

        setIsSearching(true);
        const newResults = await searchFn({
            query: query,
            cityId: filters.cityId,
            personId: filters.personId,
            partyId: filters.partyId
        }, page);
        setIsSearching(false);

        if (newResults.length === 0) {
            setHasMore(false);
        } else {
            setResults(prevResults => [...prevResults, ...newResults]);
            setPage(prevPage => prevPage + 1);
        }
    }

    const handleScroll = () => {
        const scrollPosition = window.innerHeight + window.scrollY;
        const documentHeight = document.documentElement.offsetHeight;
        const scrollThreshold = 100; // pixels from bottom

        if (scrollPosition >= documentHeight - scrollThreshold) {
            if (page < MAX_PAGES && !isSearching && hasMore) {
                search();
            }
        }
    }

    useEffect(() => {
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [results, isSearching, hasMore]);

    useEffect(() => {
        if (query || filters.cityId || filters.personId || filters.partyId) {
            search(true);
        }
    }, []);

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
                <form onSubmit={(e) => { e.preventDefault(); search(true); }} className="relative w-2/3">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input
                        placeholder={`Ψάξτε για "Σχολεία", "Αντιπλημμυρικά", "Δημοτική Αστυνομια", ή κάτι άλλο`}
                        className="pl-10 w-full"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                search(true);
                            }
                        }}
                    />
                </form>
            </div>

            {results.length === 0 ? (
                <div className="flex justify-center">
                    {isSearching ? (
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900 my-24"></div>
                    ) : (
                        <span className="text-muted-foreground italic my-24">
                            Πληκτρολογήστε για να αναζητήσετε
                        </span>
                    )}
                </div>
            ) : (
                <>
                    {results.map((r, ind) => <Result key={`$sr-${ind}`} result={r} />)}
                    <div className="flex justify-center mt-4">
                        {isSearching ? (
                            <Button disabled className="flex items-center">
                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-gray-900 mr-2"></div>
                                Φόρτωση...
                            </Button>
                        ) : hasMore ? (
                            <Button onClick={() => search()} disabled={isSearching}>
                                Δείτε περισσότερα
                            </Button>
                        ) : (
                            <span className="text-muted-foreground italic">
                                Δεν υπάρχουν άλλα αποτελέσματα
                            </span>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
