"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Plus } from "lucide-react";
import { GeocodeHit, geocode } from "../api";

interface Props {
  token: string | undefined;
  proximity?: { lng: number; lat: number } | null;
  placeholder?: string;
  onPick(hit: GeocodeHit): void;
}

/**
 * Naked underline address field with debounced Mapbox suggestions, biased
 * toward the municipality it belongs to. Degrades to plain text entry
 * (Enter adds an un-geocoded chip) without a token.
 */
export function AddressSearch({ token, proximity, placeholder, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!token || query.trim().length < 3) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const results = await geocode(query, token, proximity ?? undefined);
      if (seq.current === mine) {
        setHits(results);
        setOpen(true);
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [query, token, proximity]);

  function pick(hit: GeocodeHit) {
    onPick(hit);
    setQuery("");
    setHits([]);
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="group flex items-center gap-2 border-b border-border transition-colors focus-within:border-foreground">
        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={query}
          placeholder={placeholder ?? "Πρόσθεσε διεύθυνση ή γειτονιά"}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (hits[0]) pick(hits[0]);
              else if (!token && query.trim()) pick({ text: query.trim(), lng: 0, lat: 0 });
            }
          }}
          className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
        />
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      {open && hits.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full overflow-hidden border bg-popover shadow-lg">
          {hits.map((hit) => (
            <li key={`${hit.text}${hit.lng}`}>
              <button
                type="button"
                className="flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm hover:bg-secondary"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(hit);
                }}
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange" />
                <span className="leading-snug">{hit.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
