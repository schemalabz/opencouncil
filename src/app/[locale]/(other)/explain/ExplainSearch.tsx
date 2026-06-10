"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "@/i18n/routing";
import { Input } from "@/components/ui/input";

/**
 * Hero search bar for the explain hub. Submitting hands the query off to the
 * app's full-text search (/search?query=...).
 */
export function ExplainSearch({ placeholder }: { placeholder: string }) {
    const router = useRouter();
    const [value, setValue] = useState("");

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const q = value.trim();
        router.push(q ? `/search?query=${encodeURIComponent(q)}` : "/search");
    };

    return (
        <form onSubmit={submit} role="search" aria-label="Αναζήτηση όρων" className="relative mt-7 max-w-xl">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
                type="search"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                aria-label="Αναζήτησε έναν όρο"
                className="h-12 rounded-xl pl-11 text-base shadow-sm"
            />
        </form>
    );
}
