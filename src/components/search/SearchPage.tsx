"use client";

import { Search } from "lucide-react";
import { Input } from "../ui/input";
import MetadataFilters, { Filters } from "./MetadataFilters";
import { useState } from "react";
import { SpeakerSegment } from "@prisma/client";
import { SearchResult, search as searchFn } from "@/lib/search/search";
import { Result } from "./Result";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function SearchPage() {
    const [filters, setFilters] = useState<Filters>({});
    const [results, setResults] = useState<SearchResult[] | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [query, setQuery] = useState("");

    const search = async () => {
        setIsSearching(true);
        setResults(null); // Clear results before searching
        await sleep(2000)
        const res = await searchFn({
            query: query,
            cityId: filters.cityId,
            personId: filters.personId,
            partyId: filters.partyId
        });
        setIsSearching(false);
        setResults(res);
    }

    return (
        <div className="flex flex-col gap-4">
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
                                setResults(null); // Clear results on Enter
                                search();
                            }
                        }}
                    />
                </form>
            </div>

            {results === null ? (
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
                results.length > 0 ? (
                    results.map((r, ind) => <Result key={`$sr-${ind}`} result={r} />)
                ) : (
                    <div className="flex justify-center">
                        <span className="text-muted-foreground italic my-24">
                            Δεν βρέθηκαν αποτελέσματα
                        </span>
                    </div>
                )
            )}



        </div>
    );
}
